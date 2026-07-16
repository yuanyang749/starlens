import "server-only";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../../db/client";
import { githubAccounts, repoNotes, repoTags, starredRepos, syncRuns, type SyncRun } from "../../db/schema";
import { decryptSecret } from "../crypto/secrets";
import {
  fetchReadmeExcerpt,
  listStarredReposPage,
  summarizeSyncedRepo,
} from "./client";
import { buildSearchDocument } from "@starlens-app/core";
import type { NormalizedGitHubStarredRepo } from "./normalize";

export type SyncCounts = {
  fetched: number;
  insertedOrUpdated: number;
  unstarred: number;
};

export type SyncStatus = "running" | "success" | "error";
export type SyncErrorLevel = "auth" | "rate_limit" | "network" | "unknown";

export type SyncHistoryEntry = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  pageCount: number;
  failedCount: number;
  errorSummary: string | null;
  status: SyncStatus;
  counts: SyncCounts;
  errorLevel: SyncErrorLevel | null;
};

export type SyncGitHubStarsResult = {
  runId: string;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  nextPage: number;
  counts: SyncCounts;
  pageCount: number;
  failedCount: number;
  errorSummary: string | null;
  errorLevel: SyncErrorLevel | null;
};

const SYNC_HISTORY_LIMIT = 8;
const SYNC_PAGE_SIZE = 25;
const SYNC_ENRICHMENT_CONCURRENCY = 4;

function asSyncStatus(value: string): SyncStatus {
  return value === "success" || value === "error" ? value : "running";
}

function asSyncErrorLevel(value: string | null): SyncErrorLevel | null {
  return value === "auth" || value === "rate_limit" || value === "network" || value === "unknown"
    ? value
    : null;
}

function resultFromRun(run: SyncRun): SyncGitHubStarsResult {
  return {
    runId: run.id,
    status: asSyncStatus(run.status),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    nextPage: run.nextPage,
    pageCount: run.pageCount,
    failedCount: run.failedCount,
    errorSummary: run.errorSummary,
    errorLevel: asSyncErrorLevel(run.errorLevel),
    counts: {
      fetched: run.fetched,
      insertedOrUpdated: run.insertedOrUpdated,
      unstarred: run.unstarred,
    },
  };
}

function historyFromRun(run: SyncRun): SyncHistoryEntry {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    pageCount: run.pageCount,
    failedCount: run.failedCount,
    errorSummary: run.errorSummary,
    status: asSyncStatus(run.status),
    counts: {
      fetched: run.fetched,
      insertedOrUpdated: run.insertedOrUpdated,
      unstarred: run.unstarred,
    },
    errorLevel: asSyncErrorLevel(run.errorLevel),
  };
}

// sync_runs 让刷新页面、重启实例或多次请求时都能从已完成页继续。
export async function getSyncHistory(userId: string): Promise<SyncHistoryEntry[]> {
  const db = getDb();
  const runs = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.userId, userId))
    .orderBy(desc(syncRuns.startedAt))
    .limit(SYNC_HISTORY_LIMIT);

  return runs.map(historyFromRun);
}

export function resolveSyncErrorLevel(error: unknown): SyncErrorLevel {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("401") || message.includes("403") || message.includes("token")) {
    return "auth";
  }

  if (message.includes("429") || message.includes("rate limit")) {
    return "rate_limit";
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econn")
  ) {
    return "network";
  }

  return "unknown";
}

async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency = SYNC_ENRICHMENT_CONCURRENCY,
) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) await worker(item);
    }
  }));
}

async function getOrCreateResumableSyncRun(userId: string, accountId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, userId),
        or(eq(syncRuns.status, "running"), eq(syncRuns.status, "error")),
      ),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  if (existing) {
    // 可恢复错误（例如网络瞬断或 GitHub 限流）保留已经完成的页数；下一次 POST
    // 继续同一个 run，而不是从第一页重新导入。
    if (existing.status === "error") {
      const now = new Date();
      const [resumed] = await db
        .update(syncRuns)
        .set({
          status: "running",
          finishedAt: null,
          errorSummary: null,
          errorLevel: null,
          updatedAt: now,
        })
        .where(eq(syncRuns.id, existing.id))
        .returning();

      await db
        .update(githubAccounts)
        .set({
          lastSyncStartedAt: now,
          lastSyncStatus: "running",
          lastSyncError: null,
          updatedAt: now,
        })
        .where(eq(githubAccounts.id, accountId));

      return resumed;
    }

    return existing;
  }

  const now = new Date();
  const [created] = await db
    .insert(syncRuns)
    .values({ userId, status: "running", startedAt: now })
    .returning();

  await db
    .update(githubAccounts)
    .set({
      lastSyncStartedAt: now,
      lastSyncStatus: "running",
      lastSyncError: null,
      updatedAt: now,
    })
    .where(eq(githubAccounts.id, accountId));

  return created;
}

async function markSyncRunFailed(run: SyncRun, accountId: string, error: unknown) {
  const db = getDb();
  const now = new Date();
  const errorSummary = error instanceof Error ? error.message : "Unknown sync error";
  const errorLevel = resolveSyncErrorLevel(error);
  const [failed] = await db
    .update(syncRuns)
    .set({
      status: "error",
      finishedAt: now,
      failedCount: run.failedCount + 1,
      errorSummary,
      errorLevel,
      updatedAt: now,
    })
    .where(eq(syncRuns.id, run.id))
    .returning();

  await db
    .update(githubAccounts)
    .set({
      lastSyncFinishedAt: now,
      lastSyncStatus: "error",
      lastSyncError: errorSummary,
      updatedAt: now,
    })
    .where(eq(githubAccounts.id, accountId));

  return failed;
}

// 中文注释：导出供 analyze.ts 等需要直接调 GitHub API 的模块复用——避免在每个调用方
// 重复一遍"查 githubAccounts + 解密 token"的逻辑，保持密钥解密路径单一可审计。
export async function getGitHubAccessToken(userId: string) {
  const db = getDb();
  const account = await db.query.githubAccounts.findFirst({
    where: eq(githubAccounts.userId, userId),
  });

  if (!account) {
    throw new Error("GitHub account is not connected.");
  }

  return {
    account,
    token: decryptSecret(account.accessTokenEncrypted),
  };
}

async function getTagsAndNote(userId: string, repoId: string) {
  const db = getDb();
  const [tags, note] = await Promise.all([
    db
      .select()
      .from(repoTags)
      .where(and(eq(repoTags.userId, userId), eq(repoTags.starredRepoId, repoId))),
    db.query.repoNotes.findFirst({
      where: and(eq(repoNotes.userId, userId), eq(repoNotes.starredRepoId, repoId)),
    }),
  ]);

  return {
    tags: tags.map((row) => row.tag),
    note: note?.note ?? "",
  };
}

// 中文注释：导出供 github-star.ts 复用——star_repo 收藏一个新仓库时，
// 需要走和批量 sync 完全一致的"写入/更新 starred_repos 并保留 tags/note"逻辑，避免另起一套实现。
export async function upsertSyncedRepo(
  userId: string,
  token: string,
  repo: NormalizedGitHubStarredRepo,
) {
  const db = getDb();
  const existing = await db.query.starredRepos.findFirst({
    where: and(
      eq(starredRepos.userId, userId),
      eq(starredRepos.githubRepoId, repo.githubRepoId),
    ),
  });

  const shouldRefreshReadme =
    !existing ||
    existing.pushedAtGithub?.getTime() !== repo.pushedAtGithub?.getTime();
  const readmeExcerpt = shouldRefreshReadme
    ? await fetchReadmeExcerpt(token, repo.ownerLogin, repo.name).catch((error: unknown) => {
        // README 拉取失败（rate limit / 网络 / 404 路径错误）不致命——空 readme 会让 repoSummary
        // 和 searchDocument 质量下降、搜索召回率静默劣化。记录原因便于排查持续 rate limit 等场景。
        const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[github/sync] fetchReadmeExcerpt failed: owner=${repo.ownerLogin} repo=${repo.name} error=${msg}`);
        return "";
      })
    : existing.readmeExcerpt;
  const repoSummary = summarizeSyncedRepo({
    description: repo.description,
    topics: repo.topics,
    readmeExcerpt,
    fullName: repo.fullName,
  });
  const now = new Date();

  if (!existing) {
    const [created] = await db
      .insert(starredRepos)
      .values({
        userId,
        ...repo,
        repoSummary,
        readmeExcerpt,
        searchDocument: buildSearchDocument({
          fullName: repo.fullName,
          ownerLogin: repo.ownerLogin,
          description: repo.description,
          topics: repo.topics,
          repoSummary,
          readmeExcerpt,
        }),
        isStarred: true,
        unstarredAt: null,
        lastSyncedAt: now,
        readmeLastProcessedAt: shouldRefreshReadme ? now : null,
      })
      .returning();

    return created.id;
  }

  const decorations = await getTagsAndNote(userId, existing.id);

  await db
    .update(starredRepos)
    .set({
      ...repo,
      repoSummary,
      readmeExcerpt,
      searchDocument: buildSearchDocument({
        fullName: repo.fullName,
        ownerLogin: repo.ownerLogin,
        description: repo.description,
        topics: repo.topics,
        repoSummary,
        tags: decorations.tags,
        note: decorations.note,
        readmeExcerpt,
      }),
      isStarred: true,
      unstarredAt: null,
      lastSyncedAt: now,
      readmeLastProcessedAt: shouldRefreshReadme
        ? now
        : existing.readmeLastProcessedAt,
      updatedAt: now,
    })
    .where(eq(starredRepos.id, existing.id));

  return existing.id;
}

export async function syncGitHubStars(userId: string): Promise<SyncGitHubStarsResult> {
  const db = getDb();
  const { account, token } = await getGitHubAccessToken(userId);
  const run = await getOrCreateResumableSyncRun(userId, account.id);

  try {
    const page = await listStarredReposPage(token, run.nextPage, SYNC_PAGE_SIZE);
    await runWithConcurrency(page.repos, async (repo) => {
      await upsertSyncedRepo(userId, token, repo);
    });

    const nextPageCount = run.pageCount + 1;
    const nextFetched = run.fetched + page.repos.length;
    const nextInsertedOrUpdated = run.insertedOrUpdated + page.repos.length;
    const now = new Date();

    if (page.hasNextPage) {
      const [continued] = await db
        .update(syncRuns)
        .set({
          nextPage: run.nextPage + 1,
          pageCount: nextPageCount,
          fetched: nextFetched,
          insertedOrUpdated: nextInsertedOrUpdated,
          updatedAt: now,
        })
        .where(eq(syncRuns.id, run.id))
        .returning();

      return resultFromRun(continued);
    }

    // 只在最后一页完成后收敛取消 Star：本轮开始后未被刷新过的记录才是真正已取消的收藏。
    // 因而中断、刷新或重试都不会提前把用户的仓库标成未收藏。
    const unstarredRows = await db
      .update(starredRepos)
      .set({
        isStarred: false,
        unstarredAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(starredRepos.userId, userId),
          eq(starredRepos.isStarred, true),
          or(
            isNull(starredRepos.lastSyncedAt),
            lt(starredRepos.lastSyncedAt, run.startedAt),
          ),
        ),
      )
      .returning({ id: starredRepos.id });

    const [completed] = await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: now,
        pageCount: nextPageCount,
        fetched: nextFetched,
        insertedOrUpdated: nextInsertedOrUpdated,
        unstarred: unstarredRows.length,
        errorSummary: null,
        errorLevel: null,
        updatedAt: now,
      })
      .where(eq(syncRuns.id, run.id))
      .returning();

    await db
      .update(githubAccounts)
      .set({
        lastSyncFinishedAt: now,
        lastSyncStatus: "success",
        lastSyncError: null,
        updatedAt: now,
      })
      .where(eq(githubAccounts.id, account.id));

    return resultFromRun(completed);
  } catch (error) {
    return resultFromRun(await markSyncRunFailed(run, account.id, error));
  }
}
