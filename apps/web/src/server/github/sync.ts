import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { githubAccounts, repoNotes, repoTags, starredRepos } from "@/db/schema";
import { decryptSecret } from "@/server/crypto/secrets";
import {
  fetchReadmeExcerpt,
  listAllStarredRepos,
  summarizeSyncedRepo,
} from "./client";
import { buildSearchDocument } from "@starlens/core";
import { findUnstarredRepoIds } from "./sync-utils";
import type { NormalizedGitHubStarredRepo } from "./normalize";

type SyncCounts = {
  fetched: number;
  insertedOrUpdated: number;
  unstarred: number;
};

async function getGitHubAccessToken(userId: string) {
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
    ? await fetchReadmeExcerpt(token, repo.ownerLogin, repo.name).catch(() => "")
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

export async function syncGitHubStars(userId: string): Promise<SyncCounts> {
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
    const repos = await listAllStarredRepos(token);
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
      fetched: repos.length,
      insertedOrUpdated: repos.length,
      unstarred,
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
