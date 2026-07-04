// recommend_for_task 业务逻辑 —— 编码任务参考（spec 第 6.1.1 节）
// 职责：基于任务描述召回候选仓库（复用 searchReposRanked），AI 重排后返回带"为什么相关"的解释。

import "server-only";

import { and, count, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { starredRepos } from "../../db/schema";
import { searchReposRanked } from "../repos/repository";
import { callChatCompletionsWithTools, stripThinkBlocks, type AgentChatMessage } from "./ask/provider";
import type { ChatRuntimeConfig } from "./ask/types";

const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 10;

export type RecommendForTaskInput = {
  taskDescription: string;
  limit?: number;
};

export type RecommendItem = {
  id: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  language: string;
  topics: string[];
  tags: string[];
  note: string;
  reason: string;
};

export type RecommendForTaskResult = {
  data: { items: RecommendItem[] };
  meta: { empty: boolean; hint?: string };
  suggestedNextActions: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
  reasoningHints: string;
};

// 中文注释：冷启动检测——用户未同步任何 star 时返回 empty: true，让 agent 引导用户先 sync_stars。
/** @internal 测试可见，不是公共 API */
export async function hasStarredRepos(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(starredRepos)
    .where(and(eq(starredRepos.userId, userId), eq(starredRepos.isStarred, true)));
  return (rows[0]?.value ?? 0) > 0;
}

// ─── AI 重排 ────────────────────────────────────────────────────────────────

/** @internal 测试可见，不是公共 API */
export function buildRecommendSystemPrompt(): string {
  return `你是 Starlens 的仓库推荐助手。给定一个编码任务描述和一组候选仓库（已带 ts_rank 排序），你需要：
1. 根据任务描述判断哪些仓库最相关
2. 对相关仓库按相关性降序重新排序
3. 为每个保留的仓库用一句中文解释"为什么这个仓库对用户的任务有帮助"

严格规则：
- 只能从候选列表中选择仓库，绝对不能凭空生成仓库
- 排序后必须返回 JSON：{ "items": [{ "id": string, "reason": string }] }
- reason 必须基于仓库实际信息（topics/description/note/tags），不要泛泛而谈
- 不要包含任何 JSON 之外的文字、不要包裹 markdown code fence
- 候选都不相关时返回 { "items": [] }`;
}

function buildRecommendUserPrompt(taskDescription: string, candidates: Array<{
  id: string;
  fullName: string;
  description: string;
  repoSummary: string;
  language: string;
  stargazersCount: number;
  topics: string[];
  tags: string[];
  note: string;
  tsRank: number;
}>): string {
  const candidateText = candidates
    .map((c, idx) => {
      const parts = [`[${idx + 1}] id=${c.id} | ${c.fullName} | stars=${c.stargazersCount} | lang=${c.language || "unknown"}`];
      if (c.description) parts.push(`   description: ${c.description.slice(0, 200)}`);
      if (c.repoSummary) parts.push(`   summary: ${c.repoSummary.slice(0, 200)}`);
      if (c.topics.length > 0) parts.push(`   topics: ${c.topics.join(", ")}`);
      if (c.tags.length > 0) parts.push(`   user_tags: ${c.tags.join(", ")}`);
      if (c.note) parts.push(`   user_note: ${c.note.slice(0, 200)}`);
      parts.push(`   ts_rank: ${c.tsRank.toFixed(4)}`);
      return parts.join("\n");
    })
    .join("\n\n");

  return `任务描述：
${taskDescription}

候选仓库（按 ts_rank 降序）：
${candidateText}

请按任务相关性重排，并为每个保留的仓库生成一句中文 reason。`;
}

/** @internal AI 输出结构——测试可见，不是公共 API */
export type AiRecommendOutput = { items: Array<{ id: string; reason: string }> };

/** @internal 测试可见，不是公共 API */
export function parseAiRecommendOutput(raw: string | null): AiRecommendOutput | null {
  if (!raw) return null;

  const cleaned = stripThinkBlocks(raw).trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : cleaned;

  try {
    const parsed = JSON.parse(jsonText) as Partial<AiRecommendOutput>;
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items
        .filter((item): item is { id: string; reason: string } =>
          typeof item === "object" && item !== null &&
          typeof item.id === "string" && typeof item.reason === "string")
        .map((item) => ({ id: item.id, reason: item.reason.trim() })),
    };
  } catch (error) {
    // AI 返回非 JSON 时降级为不重排——直接用 searchReposRanked 的原始排序。
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/recommend] AI output JSON parse failed: error=${msg} raw=${cleaned.slice(0, 200)}`);
    return null;
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

export async function recommendForTask(
  userId: string,
  input: RecommendForTaskInput,
  chatConfig: ChatRuntimeConfig,
): Promise<RecommendForTaskResult> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // 1. 冷启动检测。
  const hasRepos = await hasStarredRepos(userId);
  if (!hasRepos) {
    return {
      data: { items: [] },
      meta: { empty: true, hint: "请先调用 sync_stars 同步你的 GitHub 收藏。" },
      suggestedNextActions: [
        { tool: "sync_stars", args: {}, reason: "同步后才能基于你的收藏进行任务推荐。" },
      ],
      reasoningHints: "用户尚未同步任何 GitHub 收藏，无法进行任务推荐。",
    };
  }

  // 2. 召回候选：复用全文检索（ts_rank 排序）。
  // 多召回一些（最多 limit * 3）给 AI 重排空间，但不超过 30 避免上下文过长。
  const candidateLimit = Math.min(Math.max(limit * 3, limit), MAX_LIMIT);
  const candidates = await searchReposRanked(userId, input.taskDescription, candidateLimit);

  if (candidates.length === 0) {
    return {
      data: { items: [] },
      meta: { empty: true, hint: "在你的收藏中没找到与该任务相关的仓库。" },
      suggestedNextActions: [],
      reasoningHints: `全文检索未召回任何仓库：taskDescription="${input.taskDescription.slice(0, 80)}"`,
    };
  }

  // 3. 调用 AI 重排。
  const messages: AgentChatMessage[] = [
    { role: "system", content: buildRecommendSystemPrompt() },
    { role: "user", content: buildRecommendUserPrompt(input.taskDescription, candidates) },
  ];

  const turn = await callChatCompletionsWithTools({
    messages,
    tools: [],
    config: chatConfig,
    userId,
    maxTokens: 800,
  });

  const aiOutput = parseAiRecommendOutput(turn?.content ?? null);

  // 4. 按 AI 排序（失败则降级为原始 ts_rank 排序）组装结果。
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const orderedIds = aiOutput && aiOutput.items.length > 0
    ? aiOutput.items.map((item) => item.id)
    : candidates.map((c) => c.id);
  const reasonById = new Map((aiOutput?.items ?? []).map((item) => [item.id, item.reason]));

  const items: RecommendItem[] = [];
  for (const id of orderedIds) {
    const candidate = candidateMap.get(id);
    if (!candidate) continue;
    items.push({
      id: candidate.id,
      fullName: candidate.fullName,
      description: candidate.description ?? "",
      htmlUrl: candidate.htmlUrl,
      stargazersCount: candidate.stargazersCount,
      language: candidate.language ?? "",
      topics: candidate.topics ?? [],
      tags: candidate.tags ?? [],
      note: candidate.note ?? "",
      reason: reasonById.get(id) ?? "基于全文检索的相关性召回。",
    });
    if (items.length >= limit) break;
  }

  // 5. suggestedNextActions：建议 agent 用 show_star 查看排名最高仓库的详情。
  const suggestedNextActions: RecommendForTaskResult["suggestedNextActions"] = [];
  if (items.length > 0) {
    suggestedNextActions.push({
      tool: "show_star",
      args: { repo: items[0].id },
      reason: "查看最相关仓库的详情（README、备注、标签等）以辅助决策。",
    });
  }

  const reasoningHints = aiOutput && aiOutput.items.length > 0
    ? `全文检索召回 ${candidates.length} 个候选，AI 重排后保留 ${items.length} 个。`
    : `全文检索召回 ${candidates.length} 个候选，AI 重排失败，已降级为原始排序返回前 ${items.length} 个。`;

  return {
    data: { items },
    meta: { empty: false },
    suggestedNextActions,
    reasoningHints,
  };
}
