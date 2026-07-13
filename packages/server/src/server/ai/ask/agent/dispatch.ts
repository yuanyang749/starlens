import "server-only";

import {
  addRepoTag,
  deleteRepoTag,
  getRepoDetail,
  getRepoStats,
  searchRepos,
  searchReposRanked,
  updateRepoCuration,
} from "../../../repos/repository";
import { unstarRepoOnGithubForUser } from "../../../repos/github-star";
import { hasStarredRepos } from "../../recommend";
import { recallByLanguage, recallByOwner, recallByTopics, resolveTargetRepo } from "../../related";
import { suggestOrganization, type OrganizationFocus } from "../../../repos/organization";
import type { SearchRepoItem } from "../types";
import { buildSingleRepoContext } from "../ranking";
import { runReadonlyQuery } from "./sql-executor";

export type AgentToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolResultMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

const MAX_PAGE_SIZE = 20;

function toIsoDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// 中文注释：给工具结果做"瘦身"，避免把完整 README/摘要等大字段塞进对话上下文，
// 跟 provider.ts 里 pickCandidatesWithProvider 的 compactPool 是同一个思路。
function compactRepo(item: SearchRepoItem) {
  return {
    id: item.id,
    fullName: item.fullName,
    language: item.language,
    stars: item.stargazersCount,
    isFavorite: item.isFavorite,
    summary: (item.aiSummary?.trim() || item.repoSummary?.trim() || item.description?.trim() || "").slice(0, 200),
    tags: item.tags,
    note: item.note || undefined,
    starredAt: item.starredAtGithub,
    // 中文注释：近期活跃预设按 pushedAt 排序，结果必须携带该日期才能给出有依据的说明。
    pushedAt: item.pushedAtGithub,
  };
}

async function runSearchRepos(userId: string, args: Record<string, unknown>, cache: Map<string, SearchRepoItem>) {
  const pageSize = Math.min(typeof args.pageSize === "number" ? args.pageSize : 10, MAX_PAGE_SIZE);
  const result = await searchRepos(userId, {
    q: typeof args.q === "string" ? args.q : undefined,
    sort: typeof args.sort === "string" ? (args.sort as "relevance" | "recent" | "stars" | "updated") : undefined,
    language: typeof args.language === "string" ? args.language : undefined,
    owner: typeof args.owner === "string" ? args.owner : undefined,
    tag: typeof args.tag === "string" ? args.tag : undefined,
    favorite: typeof args.favorite === "boolean" ? args.favorite : undefined,
    minStars: typeof args.minStars === "number" ? args.minStars : undefined,
    maxStars: typeof args.maxStars === "number" ? args.maxStars : undefined,
    starredAfter: toIsoDate(args.starredAfter),
    starredBefore: toIsoDate(args.starredBefore),
    pushedAfter: toIsoDate(args.pushedAfter),
    hasNote: typeof args.hasNote === "boolean" ? args.hasNote : undefined,
    noteContains: typeof args.noteContains === "string" ? args.noteContains : undefined,
    pageSize,
    page: 1,
  });

  for (const item of result.items) cache.set(item.id, item as SearchRepoItem);

  return { total: result.total, items: result.items.map((item) => compactRepo(item as SearchRepoItem)) };
}

async function runGetRepoDetail(userId: string, args: Record<string, unknown>, cache: Map<string, SearchRepoItem>) {
  const repoId = typeof args.repoId === "string" ? args.repoId : "";
  if (!repoId) return { error: "repoId is required" };

  const repo = await getRepoDetail(userId, repoId);
  if (!repo) return { error: "repo not found" };

  cache.set(repo.id, repo as SearchRepoItem);
  return { context: buildSingleRepoContext(repo as SearchRepoItem) };
}

async function runGetRepoStats(userId: string) {
  return getRepoStats(userId);
}

async function runReadonlyQueryTool(userId: string, args: Record<string, unknown>) {
  const rawSql = typeof args.sql === "string" ? args.sql : "";
  if (!rawSql.trim()) return { error: "sql is required" };

  try {
    const rows = await runReadonlyQuery(userId, rawSql);
    return { rows };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "query failed" };
  }
}

// ─── 写操作工具 ──────────────────────────────────────────────────────────────

async function runAddTag(userId: string, args: Record<string, unknown>) {
  const repoId = typeof args.repoId === "string" ? args.repoId : "";
  const tag = typeof args.tag === "string" ? args.tag : "";
  if (!repoId || !tag) return { error: "repoId and tag are required" };
  const updated = await addRepoTag(userId, repoId, tag);
  if (!updated) return { error: "repo not found or tag invalid" };
  return { success: true, repo: compactRepo(updated as SearchRepoItem) };
}

async function runRemoveTag(userId: string, args: Record<string, unknown>) {
  const repoId = typeof args.repoId === "string" ? args.repoId : "";
  const tag = typeof args.tag === "string" ? args.tag : "";
  if (!repoId || !tag) return { error: "repoId and tag are required" };
  const updated = await deleteRepoTag(userId, repoId, tag);
  if (!updated) return { error: "repo not found" };
  return { success: true, repo: compactRepo(updated as SearchRepoItem) };
}

async function runUpdateNote(userId: string, args: Record<string, unknown>) {
  const repoId = typeof args.repoId === "string" ? args.repoId : "";
  const note = typeof args.note === "string" ? args.note : "";
  if (!repoId) return { error: "repoId is required" };
  const updated = await updateRepoCuration(userId, repoId, { note });
  if (!updated) return { error: "repo not found" };
  return { success: true, repo: compactRepo(updated as SearchRepoItem) };
}

async function runToggleFavorite(userId: string, args: Record<string, unknown>) {
  const repoId = typeof args.repoId === "string" ? args.repoId : "";
  const isFavorite = typeof args.isFavorite === "boolean" ? args.isFavorite : undefined;
  if (!repoId || typeof isFavorite !== "boolean") return { error: "repoId and isFavorite are required" };
  const updated = await updateRepoCuration(userId, repoId, { isFavorite });
  if (!updated) return { error: "repo not found" };
  return { success: true, repo: compactRepo(updated as SearchRepoItem) };
}

async function runUnstarRepo(userId: string, args: Record<string, unknown>) {
  const repoId = typeof args.repoId === "string" ? args.repoId : "";
  if (!repoId) return { error: "repoId is required" };
  try {
    const updated = await unstarRepoOnGithubForUser(userId, repoId);
    return { success: true, repo: compactRepo(updated as SearchRepoItem) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unstar failed" };
  }
}

// ─── 深度分析工具（只读，基于 DB 召回不做 AI 重排） ──────────────────────────

async function runRecommendForTask(userId: string, args: Record<string, unknown>, cache: Map<string, SearchRepoItem>) {
  const taskDescription = typeof args.taskDescription === "string" ? args.taskDescription : "";
  if (!taskDescription.trim()) return { error: "taskDescription is required" };
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 10, 30);

  const hasRepos = await hasStarredRepos(userId);
  if (!hasRepos) return { empty: true, hint: "请先同步 GitHub 收藏" };

  const candidates = await searchReposRanked(userId, taskDescription, limit);
  for (const c of candidates) cache.set(c.id, c as SearchRepoItem);

  return {
    total: candidates.length,
    items: candidates.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      stars: c.stargazersCount,
      language: c.language,
      // 中文注释：任务推荐会进入下一轮模型上下文，限制长摘要、备注和 topics，避免十条结果放大 Token。
      summary: (c.repoSummary?.trim() || c.description?.trim() || "").slice(0, 200),
      topics: c.topics.slice(0, 8),
      tags: c.tags,
      note: c.note?.slice(0, 120),
      tsRank: c.tsRank,
    })),
  };
}

async function runFindRelated(userId: string, args: Record<string, unknown>, cache: Map<string, SearchRepoItem>) {
  const repo = typeof args.repo === "string" ? args.repo : "";
  if (!repo.trim()) return { error: "repo is required" };
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 10, 30);

  const target = await resolveTargetRepo(userId, repo);
  if (!target) return { error: "repo not found in your starred list" };

  const [byOwner, byLanguage, byTopics] = await Promise.all([
    recallByOwner(userId, target.ownerLogin, target.id),
    recallByLanguage(userId, target.language, target.id),
    recallByTopics(userId, target.topics ?? [], target.id),
  ]);

  // 去重 + 记录召回原因（owner 优先 → language → topics）
  const candidateMap = new Map<string, { row: typeof target; reasons: string[] }>();
  for (const row of byOwner) {
    const entry = candidateMap.get(row.id) ?? { row, reasons: [] };
    if (!entry.reasons.includes("同 owner")) entry.reasons.push("同 owner");
    candidateMap.set(row.id, entry);
  }
  for (const row of byLanguage) {
    const entry = candidateMap.get(row.id) ?? { row, reasons: [] };
    if (!entry.reasons.includes("同 language")) entry.reasons.push("同 language");
    candidateMap.set(row.id, entry);
  }
  for (const row of byTopics) {
    const entry = candidateMap.get(row.id) ?? { row, reasons: [] };
    if (!entry.reasons.includes("同 topic")) entry.reasons.push("同 topic");
    candidateMap.set(row.id, entry);
  }

  const items = Array.from(candidateMap.values())
    .slice(0, limit)
    .map(({ row, reasons }) => {
      cache.set(row.id, row as unknown as SearchRepoItem);
      return {
        id: row.id,
        fullName: row.fullName,
        description: row.description ?? "",
        stars: row.stargazersCount,
        language: row.language ?? "",
        topics: row.topics ?? [],
        recallReasons: reasons,
      };
    });

  return {
    target: { id: target.id, fullName: target.fullName },
    total: items.length,
    items,
  };
}

async function runSuggestOrganization(userId: string, args: Record<string, unknown>) {
  const focus = typeof args.focus === "string" ? args.focus : "all";
  const validFocuses: OrganizationFocus[] = ["duplicates", "stale", "untagged", "all"];
  if (!validFocuses.includes(focus as OrganizationFocus)) return { error: "invalid focus" };

  return suggestOrganization(userId, { focus: focus as OrganizationFocus });
}

export async function executeToolCall(
  toolCall: AgentToolCall,
  userId: string,
  cache: Map<string, SearchRepoItem>,
): Promise<ToolResultMessage> {
  let args: Record<string, unknown>;
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: "invalid arguments JSON" }) };
  }

  let payload: unknown;
  try {
    switch (toolCall.function.name) {
      case "search_repos":
        payload = await runSearchRepos(userId, args, cache);
        break;
      case "get_repo_detail":
        payload = await runGetRepoDetail(userId, args, cache);
        break;
      case "get_repo_stats":
        payload = await runGetRepoStats(userId);
        break;
      case "run_readonly_query":
        payload = await runReadonlyQueryTool(userId, args);
        break;
      case "add_tag":
        payload = await runAddTag(userId, args);
        break;
      case "remove_tag":
        payload = await runRemoveTag(userId, args);
        break;
      case "update_note":
        payload = await runUpdateNote(userId, args);
        break;
      case "toggle_favorite":
        payload = await runToggleFavorite(userId, args);
        break;
      case "unstar_repo":
        payload = await runUnstarRepo(userId, args);
        break;
      case "recommend_for_task":
        payload = await runRecommendForTask(userId, args, cache);
        break;
      case "find_related":
        payload = await runFindRelated(userId, args, cache);
        break;
      case "suggest_organization":
        payload = await runSuggestOrganization(userId, args);
        break;
      default:
        payload = { error: "unknown tool" };
    }
  } catch (caught) {
    payload = { error: caught instanceof Error ? caught.message : "tool execution failed" };
  }

  return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(payload) };
}
