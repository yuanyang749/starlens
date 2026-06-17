import "server-only";

import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  DEFAULT_SEARCH_PAGE,
  DEFAULT_SEARCH_PAGE_SIZE,
  DEFAULT_SEARCH_SORT,
  MAX_SEARCH_PAGE_SIZE,
  type RepoSummary,
  type SearchReposInput,
} from "@starlens-app/core";
import { getDb } from "../../db/client";
import { repoNotes, repoTags, starredRepos } from "../../db/schema";
import {
  REPO_TEXT_FALLBACKS,
  buildRepoSummaryDetails,
  buildSearchDocument,
} from "./text";

type RepoRow = typeof starredRepos.$inferSelect;
type NoteRow = typeof repoNotes.$inferSelect;

function dateString(value: Date | null) {
  return value?.toISOString() ?? REPO_TEXT_FALLBACKS.date;
}

function visibility(value: string) {
  return value === "private" || value === "internal" ? value : "public";
}

function toApiRepo(repo: RepoRow, tags: string[], note?: NoteRow): RepoSummary {
  const summaryDetails = buildRepoSummaryDetails({
    description: repo.description,
    topics: repo.topics,
    readmeExcerpt: repo.readmeExcerpt,
    fullName: repo.fullName,
  });
  const repoSummary = repo.repoSummary || summaryDetails.text;
  const readmeExcerpt = repo.readmeExcerpt || REPO_TEXT_FALLBACKS.readmeExcerpt;
  const repoSummaryUpdatedAt = dateString(
    repo.readmeLastProcessedAt ?? repo.lastSyncedAt,
  );
  const searchDocumentUpdatedAt = dateString(repo.updatedAt ?? repo.lastSyncedAt);

  return {
    id: repo.id,
    githubRepoId: repo.githubRepoId,
    name: repo.name,
    fullName: repo.fullName,
    ownerLogin: repo.ownerLogin,
    ownerAvatarUrl: repo.ownerAvatarUrl ?? "",
    htmlUrl: repo.htmlUrl,
    description: repo.description ?? REPO_TEXT_FALLBACKS.description,
    repoSummary,
    readmeExcerpt,
    aiSummary: repo.aiSummary ?? undefined,
    language: repo.language ?? REPO_TEXT_FALLBACKS.language,
    topics: repo.topics,
    stargazersCount: repo.stargazersCount,
    forksCount: repo.forksCount,
    openIssuesCount: repo.openIssuesCount,
    defaultBranch: repo.defaultBranch ?? REPO_TEXT_FALLBACKS.defaultBranch,
    licenseName: repo.licenseName ?? REPO_TEXT_FALLBACKS.licenseName,
    license: {
      key: repo.licenseKey ?? REPO_TEXT_FALLBACKS.licenseKey,
      name: repo.licenseName ?? REPO_TEXT_FALLBACKS.licenseName,
    },
    visibility: visibility(repo.visibility),
    archived: repo.archived,
    disabled: repo.disabled,
    isFork: repo.isFork,
    watchersCount: repo.watchersCount,
    homepage: repo.homepage ?? "",
    isFavorite: repo.isFavorite,
    tags,
    note: note?.note ?? "",
    createdAtGithub: dateString(repo.createdAtGithub),
    updatedAtGithub: dateString(repo.updatedAtGithub),
    pushedAtGithub: dateString(repo.pushedAtGithub),
    starredAtGithub: dateString(repo.starredAtGithub),
    lastSyncedAt: dateString(repo.lastSyncedAt),
    repoSummarySource: summaryDetails.source,
    repoSummaryUpdatedAt,
    readmeExcerptSource: repo.readmeExcerpt ? "github_readme_excerpt" : "system_fallback",
    readmeExcerptUpdatedAt: dateString(repo.readmeLastProcessedAt),
    searchDocumentSource: "repo_metadata",
    searchDocumentUpdatedAt,
  };
}

async function getRepoDecorations(userId: string, repoIds: string[]) {
  if (repoIds.length === 0) {
    return { tagsByRepo: new Map<string, string[]>(), notesByRepo: new Map<string, NoteRow>() };
  }

  const db = getDb();
  const [tags, notes] = await Promise.all([
    db
      .select()
      .from(repoTags)
      .where(and(eq(repoTags.userId, userId), inArray(repoTags.starredRepoId, repoIds))),
    db
      .select()
      .from(repoNotes)
      .where(and(eq(repoNotes.userId, userId), inArray(repoNotes.starredRepoId, repoIds))),
  ]);

  const tagsByRepo = new Map<string, string[]>();
  const notesByRepo = new Map<string, NoteRow>();

  for (const tag of tags) {
    tagsByRepo.set(tag.starredRepoId, [
      ...(tagsByRepo.get(tag.starredRepoId) ?? []),
      tag.tag,
    ]);
  }

  for (const note of notes) {
    notesByRepo.set(note.starredRepoId, note);
  }

  return { tagsByRepo, notesByRepo };
}

function repoWhere(userId: string, input: SearchReposInput) {
  const conditions = [
    eq(starredRepos.userId, userId),
    eq(starredRepos.isStarred, true),
  ];

  if (input.language) {
    conditions.push(ilike(starredRepos.language, input.language));
  }

  if (input.owner) {
    conditions.push(ilike(starredRepos.ownerLogin, input.owner));
  }

  if (input.favorite !== undefined) {
    conditions.push(eq(starredRepos.isFavorite, input.favorite));
  }

  if (input.q?.trim()) {
    const query = input.q.trim();
    conditions.push(
      or(
        sql`to_tsvector('simple', ${starredRepos.searchDocument}) @@ plainto_tsquery('simple', ${query})`,
        ilike(starredRepos.searchDocument, `%${query}%`),
      )!,
    );
  }

  if (input.tag) {
    conditions.push(
      sql`exists (
        select 1 from ${repoTags}
        where ${repoTags.starredRepoId} = ${starredRepos.id}
          and ${repoTags.userId} = ${userId}
          and ${repoTags.tag} = ${input.tag}
      )`,
    );
  }

  return and(...conditions);
}

export async function searchRepos(userId: string, input: SearchReposInput = {}) {
  const db = getDb();
  const page = Math.max(input.page ?? DEFAULT_SEARCH_PAGE, 1);
  const pageSize = Math.min(
    Math.max(input.pageSize ?? DEFAULT_SEARCH_PAGE_SIZE, 1),
    MAX_SEARCH_PAGE_SIZE,
  );
  const offset = (page - 1) * pageSize;
  const where = repoWhere(userId, input);

  const normalizedSort = input.sort ?? DEFAULT_SEARCH_SORT;
  const orderBy =
    normalizedSort === "stars"
      ? desc(starredRepos.stargazersCount)
      : normalizedSort === "recent"
        ? desc(starredRepos.starredAtGithub)
        : normalizedSort === "relevance" && input.q?.trim()
          ? desc(
              sql`ts_rank(to_tsvector('simple', ${starredRepos.searchDocument}), plainto_tsquery('simple', ${input.q.trim()}))`,
            )
          : desc(starredRepos.pushedAtGithub);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(starredRepos)
      .where(where)
      .orderBy(orderBy, desc(starredRepos.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(starredRepos).where(where),
  ]);

  const decorations = await getRepoDecorations(
    userId,
    rows.map((repo) => repo.id),
  );

  const total = totalRows[0]?.value ?? 0;

  return {
    items: rows.map((repo) =>
      toApiRepo(
        repo,
        decorations.tagsByRepo.get(repo.id) ?? [],
        decorations.notesByRepo.get(repo.id),
      ),
    ),
    page,
    pageSize,
    total,
    hasMore: offset + pageSize < total,
  };
}

export async function getRepoDetail(userId: string, id: string) {
  const db = getDb();
  const repo = await db.query.starredRepos.findFirst({
    where: and(eq(starredRepos.userId, userId), eq(starredRepos.id, id)),
  });

  if (!repo) {
    return null;
  }

  const decorations = await getRepoDecorations(userId, [repo.id]);
  return toApiRepo(
    repo,
    decorations.tagsByRepo.get(repo.id) ?? [],
    decorations.notesByRepo.get(repo.id),
  );
}

async function refreshSearchDocument(userId: string, repoId: string) {
  const db = getDb();
  const detail = await getRepoDetail(userId, repoId);

  if (!detail) {
    return;
  }

  await db
    .update(starredRepos)
    .set({
      searchDocument: buildSearchDocument({
        fullName: detail.fullName,
        ownerLogin: detail.ownerLogin,
        description: detail.description,
        topics: detail.topics,
        repoSummary: detail.repoSummary,
        tags: detail.tags,
        note: detail.note,
        readmeExcerpt: detail.readmeExcerpt,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(starredRepos.userId, userId), eq(starredRepos.id, repoId)));
}

export async function updateRepoCuration(
  userId: string,
  id: string,
  updates: { isFavorite?: boolean; note?: string },
) {
  const db = getDb();
  const now = new Date();
  const existing = await getRepoDetail(userId, id);

  if (!existing) {
    return null;
  }

  if (typeof updates.isFavorite === "boolean") {
    await db
      .update(starredRepos)
      .set({ isFavorite: updates.isFavorite, updatedAt: now })
      .where(and(eq(starredRepos.userId, userId), eq(starredRepos.id, id)));
  }

  if (typeof updates.note === "string") {
    await db
      .insert(repoNotes)
      .values({
        userId,
        starredRepoId: id,
        note: updates.note,
      })
      .onConflictDoUpdate({
        target: repoNotes.starredRepoId,
        set: { note: updates.note, updatedAt: now },
      });
    await refreshSearchDocument(userId, id);
  }

  return getRepoDetail(userId, id);
}

export async function addRepoTag(userId: string, id: string, tag: string) {
  const normalizedTag = tag.trim().toLowerCase();

  if (!normalizedTag) {
    return null;
  }

  const db = getDb();
  const repo = await getRepoDetail(userId, id);

  if (!repo) {
    return null;
  }

  await db
    .insert(repoTags)
    .values({ userId, starredRepoId: id, tag: normalizedTag })
    .onConflictDoNothing();
  await refreshSearchDocument(userId, id);

  return getRepoDetail(userId, id);
}

export async function deleteRepoTag(userId: string, id: string, tag: string) {
  const db = getDb();

  await db
    .delete(repoTags)
    .where(
      and(
        eq(repoTags.userId, userId),
        eq(repoTags.starredRepoId, id),
        eq(repoTags.tag, tag.trim().toLowerCase()),
      ),
    );
  await refreshSearchDocument(userId, id);

  return getRepoDetail(userId, id);
}
