// suggest_organization 业务逻辑 —— 知识整理维护（spec 第 6.1.3 节）
// 职责：纯 DB 聚合，扫描 starred_repos 找出 duplicates / stale / untagged 三类问题。
// 不自动修改，只返回建议——由 agent 引导用户逐项确认后调用 add_star_tag 等工具应用。

import "server-only";

import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { repoTags, starredRepos } from "../../db/schema";

export type OrganizationFocus = "duplicates" | "stale" | "untagged" | "all";

export type OrganizationSuggestion = {
  repoId: string;
  fullName: string;
  issue: "duplicate" | "stale" | "untagged";
  suggestion: string;
  detail?: {
    stargazersCount?: number;
    language?: string | null;
    pushedAtGithub?: string | null;
    lastSyncedAt?: string | null;
  };
};

export type SuggestOrganizationInput = {
  focus: OrganizationFocus;
};

export type SuggestOrganizationResult = {
  data: { items: OrganizationSuggestion[] };
  meta: { empty: boolean; hint?: string };
  suggestedNextActions: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
  reasoningHints: string;
};

// 中文注释：stale 阈值——pushed_at_github 距今超过 2 年视为过时。
const STALE_THRESHOLD_MS = 2 * 365 * 24 * 60 * 60 * 1000;
// 中文注释：untagged 阈值——stargazers_count > 1000 且无 user_tags 才视为"高星未分类"。
const UNTAGGED_MIN_STARS = 1000;

// ─── duplicates：同 owner + name 的重复（理论上 starred_repos_user_repo_unique 索引防住了，
// 但 GitHub 数据可能在历史 sync 中残留重复 fullName，故仍做检测）。 ─────────────────
async function findDuplicates(userId: string): Promise<OrganizationSuggestion[]> {
  const db = getDb();
  // 找出 fullName 出现多次的仓库（包括 isStarred=false 的历史 unstar 记录）。
  // 不在 SQL 层做 GROUP BY + HAVING——这里只查原始行，再在 JS 层按 fullName 分组，
  // 因为同一 fullName 多条记录可能 lastSyncedAt 不同，需要保留代表记录的详细信息。
  const rows = await db
    .select({
      repoId: starredRepos.id,
      fullName: starredRepos.fullName,
      stargazersCount: starredRepos.stargazersCount,
      language: starredRepos.language,
      lastSyncedAt: starredRepos.lastSyncedAt,
    })
    .from(starredRepos)
    .where(eq(starredRepos.userId, userId))
    .limit(200);

  // 按 fullName 分组找重复
  const byFullName = new Map<string, typeof rows>();
  for (const row of rows) {
    const arr = byFullName.get(row.fullName) ?? [];
    arr.push(row);
    byFullName.set(row.fullName, arr);
  }

  const items: OrganizationSuggestion[] = [];
  for (const [fullName, group] of byFullName) {
    if (group.length < 2) continue;
    // 同一 fullName 多条记录——保留最新一条作为代表
    const sorted = group.sort((a, b) =>
      (b.lastSyncedAt?.getTime() ?? 0) - (a.lastSyncedAt?.getTime() ?? 0));
    const rep = sorted[0]!;
    items.push({
      repoId: rep.repoId,
      fullName,
      issue: "duplicate",
      suggestion: `发现 ${group.length} 条 fullName="${fullName}" 的记录。建议删除冗余记录，仅保留最新一条。`,
      detail: {
        stargazersCount: rep.stargazersCount,
        language: rep.language,
        lastSyncedAt: rep.lastSyncedAt?.toISOString() ?? null,
      },
    });
  }

  return items;
}

// ─── stale：pushed_at_github 超 2 年 ─────────────────────────────────────────
async function findStale(userId: string): Promise<OrganizationSuggestion[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const rows = await db
    .select({
      repoId: starredRepos.id,
      fullName: starredRepos.fullName,
      stargazersCount: starredRepos.stargazersCount,
      language: starredRepos.language,
      pushedAtGithub: starredRepos.pushedAtGithub,
      lastSyncedAt: starredRepos.lastSyncedAt,
    })
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        isNotNull(starredRepos.pushedAtGithub),
        lte(starredRepos.pushedAtGithub, cutoff),
      ),
    )
    .orderBy(sql`${starredRepos.pushedAtGithub} ASC`)
    .limit(100);

  return rows.map((row) => ({
    repoId: row.repoId,
    fullName: row.fullName,
    issue: "stale" as const,
    suggestion: "该仓库已超过 2 年未推送更新，可能已停止维护。建议确认是否仍需要保留在收藏中。",
    detail: {
      stargazersCount: row.stargazersCount,
      language: row.language,
      pushedAtGithub: row.pushedAtGithub?.toISOString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    },
  }));
}

// ─── untagged：高 star 仓库但无 user_tags ───────────────────────────────────
async function findUntagged(userId: string): Promise<OrganizationSuggestion[]> {
  const db = getDb();

  // 中文注释：用 NOT EXISTS 子查询找无标签仓库，避免 N+1。
  // 阈值 stargazers_count > 1000 —— spec 第 6.1.3 节"高 star 未分类"。
  const rows = await db
    .select({
      repoId: starredRepos.id,
      fullName: starredRepos.fullName,
      stargazersCount: starredRepos.stargazersCount,
      language: starredRepos.language,
      topics: starredRepos.topics,
    })
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        gte(starredRepos.stargazersCount, UNTAGGED_MIN_STARS + 1),
        // 排除已有标签的仓库
        sql`NOT EXISTS (
          SELECT 1 FROM ${repoTags}
          WHERE ${repoTags.starredRepoId} = ${starredRepos.id}
            AND ${repoTags.userId} = ${userId}
        )`,
      ),
    )
    .orderBy(sql`${starredRepos.stargazersCount} DESC`)
    .limit(100);

  return rows.map((row) => {
    const topicList = Array.isArray(row.topics) ? row.topics : [];
    const suggestion = topicList.length > 0
      ? `该仓库 star 数=${row.stargazersCount} 但未打标签。可参考 GitHub topics（${topicList.slice(0, 3).join(", ")}）添加用户标签。`
      : `该仓库 star 数=${row.stargazersCount} 但未打标签。建议根据仓库用途添加分类标签。`;
    return {
      repoId: row.repoId,
      fullName: row.fullName,
      issue: "untagged" as const,
      suggestion,
      detail: {
        stargazersCount: row.stargazersCount,
        language: row.language,
      },
    };
  });
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

export async function suggestOrganization(
  userId: string,
  input: SuggestOrganizationInput,
): Promise<SuggestOrganizationResult> {
  const focus = input.focus;

  // 并行查询所有需要的维度（focus=all 时三个都查；否则只查指定维度）。
  const tasks: Promise<OrganizationSuggestion[]>[] = [];
  if (focus === "duplicates" || focus === "all") tasks.push(findDuplicates(userId));
  if (focus === "stale" || focus === "all") tasks.push(findStale(userId));
  if (focus === "untagged" || focus === "all") tasks.push(findUntagged(userId));

  const results = await Promise.all(tasks);
  const items = results.flat();

  // 中文注释：suggest_organization 不自动修改——只返回建议（spec 第 6.3 节）。
  // suggestedNextActions 引导 agent 在用户确认后调用 add_star_tag 等工具。
  const suggestedNextActions: SuggestOrganizationResult["suggestedNextActions"] = [];

  // 取第一个 untagged 建议作为示范 next action，让 agent 知道下一步可以怎么走。
  const firstUntagged = items.find((item) => item.issue === "untagged");
  if (firstUntagged) {
    suggestedNextActions.push({
      tool: "show_star",
      args: { repo: firstUntagged.repoId },
      reason: "查看未分类高 star 仓库的详情，确认合适的标签后再调用 add_star_tag。",
    });
  }

  const focusDescription = focus === "all"
    ? "duplicates + stale + untagged 三个维度"
    : `${focus} 维度`;

  const reasoningHints = items.length > 0
    ? `扫描 ${focusDescription}，共发现 ${items.length} 条建议。建议未经自动应用，需用户逐项确认。`
    : `扫描 ${focusDescription}，未发现需要整理的仓库。`;

  return {
    data: { items },
    meta: {
      empty: items.length === 0,
      ...(items.length === 0 ? { hint: "当前维度下没有需要整理的仓库。" } : {}),
    },
    suggestedNextActions,
    reasoningHints,
  };
}
