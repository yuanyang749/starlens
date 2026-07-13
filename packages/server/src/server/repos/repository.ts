import "server-only";

import { and, asc, count, desc, eq, gte, getTableColumns, ilike, inArray, isNull, lt, lte, not, or, sql } from "drizzle-orm";
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
import {
  DASHBOARD_COMMUNITY_REPO_LIMIT,
  buildAttentionReasons,
  completeMonthlyTrend,
  toIsoDateString,
} from "./dashboard-stats";

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

  if (input.minStars !== undefined) {
    conditions.push(gte(starredRepos.stargazersCount, input.minStars));
  }
  if (input.maxStars !== undefined) {
    conditions.push(lte(starredRepos.stargazersCount, input.maxStars));
  }
  if (input.starredAfter) {
    conditions.push(gte(starredRepos.starredAtGithub, input.starredAfter));
  }
  if (input.starredBefore) {
    conditions.push(lte(starredRepos.starredAtGithub, input.starredBefore));
  }
  if (input.pushedAfter) {
    conditions.push(gte(starredRepos.pushedAtGithub, input.pushedAfter));
  }
  if (input.hasNote !== undefined) {
    const noteExists = sql`exists (
        select 1 from ${repoNotes}
        where ${repoNotes.starredRepoId} = ${starredRepos.id}
          and ${repoNotes.userId} = ${userId}
          and length(trim(${repoNotes.note})) > 0
      )`;
    conditions.push(input.hasNote ? noteExists : not(noteExists));
  }
  if (input.noteContains) {
    const notePat = `%${input.noteContains}%`;
    conditions.push(
      sql`exists (
        select 1 from ${repoNotes}
        where ${repoNotes.starredRepoId} = ${starredRepos.id}
          and ${repoNotes.userId} = ${userId}
          and ${repoNotes.note} ilike ${notePat}
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

  const [rows, totalRows, allStarsRows, favRows] = await Promise.all([
    db
      .select()
      .from(starredRepos)
      .where(where)
      .orderBy(orderBy, desc(starredRepos.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(starredRepos).where(where),
    db
      .select({ value: count() })
      .from(starredRepos)
      .where(
        and(
          eq(starredRepos.userId, userId),
          eq(starredRepos.isStarred, true)
        )
      ),
    db
      .select({ value: count() })
      .from(starredRepos)
      .where(
        and(
          eq(starredRepos.userId, userId),
          eq(starredRepos.isStarred, true),
          eq(starredRepos.isFavorite, true)
        )
      ),
  ]);

  const decorations = await getRepoDecorations(
    userId,
    rows.map((repo) => repo.id),
  );

  const total = totalRows[0]?.value ?? 0;
  const allStarsTotal = allStarsRows[0]?.value ?? 0;
  const favoritesTotal = favRows[0]?.value ?? 0;

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
    allStarsTotal,
    favoritesTotal,
  };
}

// 中文注释：带 ts_rank 置信度分数的搜索，供 AI 问答召回层使用。
// 仅在传入 q 时 ts_rank 有意义；ilike-only 命中的 ts_rank 为 0，可用于低置信度过滤。
export async function searchReposRanked(userId: string, q: string, pageSize: number) {
  const db = getDb();
  const clampedSize = Math.min(Math.max(pageSize, 1), MAX_SEARCH_PAGE_SIZE);
  const tsExpr = sql<number>`ts_rank(to_tsvector('simple', ${starredRepos.searchDocument}), plainto_tsquery('simple', ${q}))`;

  const rows = await db
    .select({
      ...getTableColumns(starredRepos),
      tsRank: tsExpr,
    })
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        or(
          sql`to_tsvector('simple', ${starredRepos.searchDocument}) @@ plainto_tsquery('simple', ${q})`,
          ilike(starredRepos.searchDocument, `%${q}%`),
        )!,
      ),
    )
    .orderBy(desc(tsExpr), desc(starredRepos.id))
    .limit(clampedSize);

  const decorations = await getRepoDecorations(userId, rows.map((r) => r.id));

  return rows.map((repo) => ({
    ...toApiRepo(repo, decorations.tagsByRepo.get(repo.id) ?? [], decorations.notesByRepo.get(repo.id)),
    tsRank: Number(repo.tsRank ?? 0),
  }));
}

// 中文注释：UUID 格式校验——starred_repos.id 是 uuid 列，同 github-star.ts / analyze.ts 的
// UUID_RE 约定。非 UUID 字符串（如 "owner/repo"）直接传给 eq(starredRepos.id, ...) 会让
// Postgres 抛 "invalid input syntax for type uuid"（500），而不是预期的 404。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 把路由层传入的 id 或 owner/repo 全名统一解析成 starred_repos.id（UUID）。
// 只在路由边界调用——getRepoDetail/updateRepoCuration/addRepoTag/deleteRepoTag 本身
// 仍然只接受真实 UUID，内部调用方（github-star.ts、analyze.ts、本文件的
// refreshSearchDocument）传入的都已经是解析好的 UUID。
export async function resolveRepoRowId(userId: string, idOrFullName: string): Promise<string | null> {
  const db = getDb();

  if (UUID_RE.test(idOrFullName)) {
    const byId = await db.query.starredRepos.findFirst({
      where: and(eq(starredRepos.userId, userId), eq(starredRepos.id, idOrFullName)),
      columns: { id: true },
    });
    if (byId) return byId.id;
  }

  const byFullName = await db.query.starredRepos.findFirst({
    where: and(eq(starredRepos.userId, userId), eq(starredRepos.fullName, idOrFullName)),
    columns: { id: true },
  });

  return byFullName?.id ?? null;
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

export type RepoStats = {
  total: number;
  byLanguage: Array<{ language: string; count: number }>;
  totalFavorites: number;
  recentAdded: number;
  attention: {
    total: number;
    stale: number;
    archived: number;
    untagged: number;
    missingMetadata: number;
  };
  attentionRepos: Array<{
    id: string;
    fullName: string;
    language: string | null;
    stargazersCount: number;
    pushedAtGithub: string | null;
    reasons: string[];
  }>;
  lastSyncedAt: string | null;
  mostStarredRepo: { fullName: string; stargazersCount: number } | null;
  monthlyTrend: Array<{ month: string; count: number }>;
  topRepos: Array<{ fullName: string; language: string | null; stargazersCount: number }>;
};

export async function getRepoStats(userId: string): Promise<RepoStats> {
  const db = getDb();
  const base = and(eq(starredRepos.userId, userId), eq(starredRepos.isStarred, true));
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const staleBefore = new Date(now);
  staleBefore.setUTCFullYear(staleBefore.getUTCFullYear() - 2);
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const isStale = or(isNull(starredRepos.pushedAtGithub), lt(starredRepos.pushedAtGithub, staleBefore));
  const isUntagged = sql<boolean>`not exists (
    select 1 from ${repoTags}
    where ${repoTags.starredRepoId} = ${starredRepos.id}
  )`;
  const needsAttention = or(
    eq(starredRepos.archived, true),
    eq(starredRepos.disabled, true),
    isStale,
    isNull(starredRepos.language),
    isUntagged,
  );

  const [
    totalRows,
    langRows,
    favRows,
    recentRows,
    attentionRows,
    staleRows,
    archivedRows,
    untaggedRows,
    missingMetadataRows,
    lastSyncRows,
    topStarRows,
    trendRows,
    topReposRows,
    attentionRepoRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(starredRepos).where(base),
    db
      .select({ language: starredRepos.language, cnt: count() })
      .from(starredRepos)
      .where(base)
      .groupBy(starredRepos.language)
      .orderBy(desc(count()))
      .limit(10),
    db.select({ value: count() }).from(starredRepos).where(
      and(base, eq(starredRepos.isFavorite, true)),
    ),
    db.select({ value: count() }).from(starredRepos).where(
      and(base, gte(starredRepos.starredAtGithub, thirtyDaysAgo)),
    ),
    db.select({ value: count() }).from(starredRepos).where(and(base, needsAttention)),
    db.select({ value: count() }).from(starredRepos).where(and(base, isStale)),
    db.select({ value: count() }).from(starredRepos).where(
      and(base, eq(starredRepos.archived, true)),
    ),
    db.select({ value: count() }).from(starredRepos).where(and(base, isUntagged)),
    db.select({ value: count() }).from(starredRepos).where(and(base, isNull(starredRepos.language))),
    db
      .select({ value: sql<Date | string | null>`max(${starredRepos.lastSyncedAt})` })
      .from(starredRepos)
      .where(base),
    db
      .select({ fullName: starredRepos.fullName, stargazersCount: starredRepos.stargazersCount })
      .from(starredRepos)
      .where(base)
      .orderBy(desc(starredRepos.stargazersCount))
      .limit(1),
    db
      .select({
        month: sql<string>`to_char(${starredRepos.starredAtGithub}, 'YYYY-MM')`,
        cnt: count(),
      })
      .from(starredRepos)
      .where(and(base, gte(starredRepos.starredAtGithub, trendStart)))
      .groupBy(sql`to_char(${starredRepos.starredAtGithub}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${starredRepos.starredAtGithub}, 'YYYY-MM')`),
    db
      .select({
        fullName: starredRepos.fullName,
        language: starredRepos.language,
        stargazersCount: starredRepos.stargazersCount,
      })
      .from(starredRepos)
      .where(base)
      .orderBy(desc(starredRepos.stargazersCount))
      .limit(DASHBOARD_COMMUNITY_REPO_LIMIT),
    db
      .select({
        id: starredRepos.id,
        fullName: starredRepos.fullName,
        language: starredRepos.language,
        stargazersCount: starredRepos.stargazersCount,
        pushedAtGithub: starredRepos.pushedAtGithub,
        archived: starredRepos.archived,
        disabled: starredRepos.disabled,
        hasTags: sql<boolean>`exists (
          select 1 from ${repoTags}
          where ${repoTags.starredRepoId} = ${starredRepos.id}
        )`,
      })
      .from(starredRepos)
      .where(and(base, needsAttention))
      .orderBy(desc(starredRepos.archived), desc(starredRepos.disabled), asc(starredRepos.pushedAtGithub))
      .limit(6),
  ]);

  return {
    total: totalRows[0]?.value ?? 0,
    byLanguage: langRows.map((r) => ({ language: r.language ?? "Unknown", count: Number(r.cnt) })),
    totalFavorites: favRows[0]?.value ?? 0,
    recentAdded: recentRows[0]?.value ?? 0,
    attention: {
      total: attentionRows[0]?.value ?? 0,
      stale: staleRows[0]?.value ?? 0,
      archived: archivedRows[0]?.value ?? 0,
      untagged: untaggedRows[0]?.value ?? 0,
      missingMetadata: missingMetadataRows[0]?.value ?? 0,
    },
    attentionRepos: attentionRepoRows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      language: row.language,
      stargazersCount: row.stargazersCount ?? 0,
      pushedAtGithub: toIsoDateString(row.pushedAtGithub),
      reasons: buildAttentionReasons(row, now),
    })),
    lastSyncedAt: toIsoDateString(lastSyncRows[0]?.value),
    mostStarredRepo: topStarRows[0]
      ? { fullName: topStarRows[0].fullName, stargazersCount: topStarRows[0].stargazersCount ?? 0 }
      : null,
    monthlyTrend: completeMonthlyTrend(
      trendRows.map((r) => ({ month: r.month, count: Number(r.cnt) })),
      now,
    ),
    topRepos: topReposRows.map((r) => ({
      fullName: r.fullName,
      language: r.language,
      stargazersCount: r.stargazersCount ?? 0,
    })),
  };
}
