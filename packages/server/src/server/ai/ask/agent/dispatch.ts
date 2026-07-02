import "server-only";

import { getRepoDetail, getRepoStats, searchRepos } from "../../../repos/repository";
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
      default:
        payload = { error: "unknown tool" };
    }
  } catch (caught) {
    payload = { error: caught instanceof Error ? caught.message : "tool execution failed" };
  }

  return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(payload) };
}
