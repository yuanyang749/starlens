import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import { githubAccounts, repoNotes, repoTags, starredRepos } from "../../db/schema";
import { decryptSecret } from "../crypto/secrets";
import {
  fetchReadmeExcerpt,
  listAllStarredRepos,
  summarizeSyncedRepo,
} from "./client";
import { buildSearchDocument } from "@starlens-app/core";
import { findUnstarredRepoIds } from "./sync-utils";
import type { NormalizedGitHubStarredRepo } from "./normalize";

type SyncCounts = {
  fetched: number;
  insertedOrUpdated: number;
  unstarred: number;
};

type SyncErrorLevel = "auth" | "rate_limit" | "network" | "unknown";

export type SyncHistoryEntry = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pageCount: number;
  failedCount: number;
  errorSummary: string | null;
  status: "success" | "error";
  counts: SyncCounts;
  errorLevel: SyncErrorLevel | null;
};

export type SyncGitHubStarsResult = {
  counts: SyncCounts;
  pageCount: number;
  failedCount: number;
};

const SYNC_HISTORY_LIMIT = 8;
// 中文注释：当前为进程内实现，多实例部署需迁移至 sync_runs 表（见架构优化方案 6.3）。
// githubAccounts 表已持久化最近一次同步状态，此历史仅用于短期 UI 展示。
const syncHistoryByUser = new Map<string, SyncHistoryEntry[]>();

export function addSyncHistory(userId: string, entry: SyncHistoryEntry) {
  const history = syncHistoryByUser.get(userId) ?? [];
  const nextHistory = [entry, ...history].slice(0, SYNC_HISTORY_LIMIT);
  syncHistoryByUser.set(userId, nextHistory);
}

export function getSyncHistory(userId: string) {
  return syncHistoryByUser.get(userId) ?? [];
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

async function upsertSyncedRepo(
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
  const now = new Date();

  await db
    .update(githubAccounts)
    .set({
      lastSyncStartedAt: now,
      lastSyncStatus: "running",
      lastSyncError: null,
      updatedAt: now,
    })
    .where(eq(githubAccounts.id, account.id));

  try {
    const { repos, pages } = await listAllStarredRepos(token);
    const syncedIds: string[] = [];

    for (const repo of repos) {
      syncedIds.push(await upsertSyncedRepo(userId, token, repo));
    }

    const existingStarredRows = await db
      .select({ id: starredRepos.id })
      .from(starredRepos)
      .where(and(eq(starredRepos.userId, userId), eq(starredRepos.isStarred, true)));
    const unstarredIds = findUnstarredRepoIds(
      existingStarredRows.map((repo) => repo.id),
      syncedIds,
    );
    let unstarred = 0;

    if (unstarredIds.length > 0) {
      const result = await db
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
            inArray(starredRepos.id, unstarredIds),
          ),
        )
        .returning({ id: starredRepos.id });
      unstarred = result.length;
    }

    await db
      .update(githubAccounts)
      .set({
        lastSyncFinishedAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(githubAccounts.id, account.id));

    return {
      counts: {
        fetched: repos.length,
        insertedOrUpdated: repos.length,
        unstarred,
      },
      pageCount: pages,
      failedCount: 0,
    };
  } catch (error) {
    await db
      .update(githubAccounts)
      .set({
        lastSyncFinishedAt: new Date(),
        lastSyncStatus: "error",
        lastSyncError: error instanceof Error ? error.message : "Unknown sync error",
        updatedAt: new Date(),
      })
      .where(eq(githubAccounts.id, account.id));

    throw error;
  }
}
