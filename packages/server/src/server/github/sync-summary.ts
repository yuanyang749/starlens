// get_sync_summary 业务逻辑 —— 同步后报告（spec 第 6.1.4 节）
// 职责：基于 githubAccounts.lastSyncFinishedAt + starred_repos.last_synced_at / unstarred_at
// 返回最近一次同步的新增/消失/变化仓库摘要。

// TODO: 精确的 added/changed 区分需要 sync_changes 表（见 spec 第 9.1 节），当前为轻量实现。
// 当前实现：
//   - lastSyncAt: 从 githubAccounts.lastSyncFinishedAt 读取
//   - added[]: starred_repos.last_synced_at 在 since 之后的仓库（不区分 added/changed）
//   - removed[]: starred_repos.unstarred_at 在 since 之后的仓库
//   - changed[]: 暂为空（需 sync_changes 表才能精确实现）

import "server-only";

import { and, eq, gte } from "drizzle-orm";
import { getDb } from "../../db/client";
import { githubAccounts, starredRepos } from "../../db/schema";

const MAX_ITEMS = 200; // 单次返回上限，避免大同步场景响应过大

export type GetSyncSummaryInput = {
  since?: string; // ISO 8601 时间戳，可选
};

export type SyncSummaryItem = {
  repoId: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  stargazersCount: number;
  language: string | null;
  detectedAt: string; // ISO 时间戳
};

export type GetSyncSummaryResult = {
  data: {
    lastSyncAt: string | null;
    since: string;
    added: SyncSummaryItem[];
    removed: SyncSummaryItem[];
    changed: SyncSummaryItem[];
    totalCount: { added: number; removed: number; changed: number };
  };
  meta: { empty: boolean; hint?: string };
  suggestedNextActions: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
  reasoningHints: string;
};

// ─── 主入口 ──────────────────────────────────────────────────────────────────

export async function getSyncSummary(
  userId: string,
  input: GetSyncSummaryInput,
): Promise<GetSyncSummaryResult> {
  const db = getDb();

  // 1. 读取上次同步完成时间——作为 lastSyncAt 和默认 since。
  const account = await db.query.githubAccounts.findFirst({
    where: eq(githubAccounts.userId, userId),
  });

  const lastSyncAt = account?.lastSyncFinishedAt ?? null;
  const lastSyncAtIso = lastSyncAt?.toISOString() ?? null;

  // 2. 确定 since 时间点：
  //   - 用户传了 since → 用用户的
  //   - 用户没传 → 用 lastSyncAt
  //   - 都没有 → 返回空结果
  let sinceDate: Date | null = null;
  let sinceIso = "";
  if (input.since) {
    const parsed = new Date(input.since);
    if (!Number.isNaN(parsed.getTime())) {
      sinceDate = parsed;
      sinceIso = parsed.toISOString();
    } else {
      // since 解析失败时降级用 lastSyncAt，避免直接报错——agent 仍能拿到合理摘要。
      console.warn(`[github/sync-summary] invalid since="${input.since}", falling back to lastSyncFinishedAt`);
    }
  }
  if (!sinceDate && lastSyncAt) {
    sinceDate = lastSyncAt;
    sinceIso = lastSyncAt.toISOString();
  }
  if (!sinceDate) {
    // 没有 since 也没有 lastSyncAt——用户从未同步过。
    return {
      data: {
        lastSyncAt: lastSyncAtIso,
        since: sinceIso || new Date().toISOString(),
        added: [],
        removed: [],
        changed: [],
        totalCount: { added: 0, removed: 0, changed: 0 },
      },
      meta: { empty: true, hint: "尚未同步过 GitHub 收藏。请先调用 sync_stars。" },
      suggestedNextActions: [
        { tool: "sync_stars", args: {}, reason: "首次同步后才能查看变化摘要。" },
      ],
      reasoningHints: "用户从未完成过 GitHub 同步，无法生成变化摘要。",
    };
  }

  // 3. 查询 added（last_synced_at >= since 的仓库——简化版，不区分 added/changed）。
  const addedRows = await db
    .select({
      repoId: starredRepos.id,
      fullName: starredRepos.fullName,
      description: starredRepos.description,
      htmlUrl: starredRepos.htmlUrl,
      stargazersCount: starredRepos.stargazersCount,
      language: starredRepos.language,
      detectedAt: starredRepos.lastSyncedAt,
    })
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        gte(starredRepos.lastSyncedAt, sinceDate),
      ),
    )
    .limit(MAX_ITEMS);

  // 4. 查询 removed（unstarred_at >= since 的仓库）。
  const removedRows = await db
    .select({
      repoId: starredRepos.id,
      fullName: starredRepos.fullName,
      description: starredRepos.description,
      htmlUrl: starredRepos.htmlUrl,
      stargazersCount: starredRepos.stargazersCount,
      language: starredRepos.language,
      detectedAt: starredRepos.unstarredAt,
    })
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, false),
        gte(starredRepos.unstarredAt, sinceDate),
      ),
    )
    .limit(MAX_ITEMS);

  const toSummary = (row: { repoId: string; fullName: string; description: string | null; htmlUrl: string; stargazersCount: number; language: string | null; detectedAt: Date | null }): SyncSummaryItem => ({
    repoId: row.repoId,
    fullName: row.fullName,
    description: row.description,
    htmlUrl: row.htmlUrl,
    stargazersCount: row.stargazersCount,
    language: row.language,
    detectedAt: row.detectedAt?.toISOString() ?? "",
  });

  const added = addedRows.map(toSummary);
  const removed = removedRows.map(toSummary);
  // TODO: 精确的 changed 区分需要 sync_changes 表（见 spec 第 9.1 节），当前为轻量实现。
  const changed: SyncSummaryItem[] = [];

  const totalCount = {
    added: added.length,
    removed: removed.length,
    changed: changed.length,
  };
  const empty = totalCount.added === 0 && totalCount.removed === 0 && totalCount.changed === 0;

  // 5. suggestedNextActions：若有新增，建议 agent 引导用户用 search_stars 浏览。
  const suggestedNextActions: GetSyncSummaryResult["suggestedNextActions"] = [];
  if (totalCount.added > 0) {
    suggestedNextActions.push({
      tool: "search_stars",
      args: { sort: "recent" },
      reason: `本次同步新增 ${totalCount.added} 个仓库，按最近收藏排序浏览。`,
    });
  }

  const reasoningHints = empty
    ? `自 ${sinceIso} 以来无仓库变化。`
    : `自 ${sinceIso} 以来：新增 ${totalCount.added}，消失 ${totalCount.removed}，变化 ${totalCount.changed}。当前为轻量实现，added 可能包含 changed（需 sync_changes 表才能精确区分）。`;

  return {
    data: {
      lastSyncAt: lastSyncAtIso,
      since: sinceIso,
      added,
      removed,
      changed,
      totalCount,
    },
    meta: {
      empty,
      ...(empty ? { hint: "自上次同步以来无仓库变化。" } : {}),
    },
    suggestedNextActions,
    reasoningHints,
  };
}
