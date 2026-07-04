// find_related 业务逻辑 —— 给定仓库找相关仓库（spec 第 6.1.2 节）
// 职责：解析目标仓库 → 召回同 owner / 同 topic / 同 language 的仓库 → 用 AI 做语义相关性判断 → 返回带关联原因的列表。

import "server-only";

import { and, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { starredRepos } from "../../db/schema";
import { callChatCompletionsWithTools, stripThinkBlocks, type AgentChatMessage } from "./ask/provider";
import type { ChatRuntimeConfig } from "./ask/types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
const MAX_RECALL_PER_DIMENSION = 30; // 每个维度（owner/topic/language）最多召回 30 个，避免上下文爆炸

export type FindRelatedInput = {
  repo: string;        // Starlens id 或 owner/repo
  limit?: number;
};

export type RelatedItem = {
  id: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  language: string;
  topics: string[];
  tags: string[];
  note: string;
  relation: string;
};

export type FindRelatedResult = {
  data: { items: RelatedItem[] };
  meta: { empty: boolean; hint?: string };
  suggestedNextActions: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
  reasoningHints: string;
};

type RepoRow = typeof starredRepos.$inferSelect;

// ─── 目标仓库解析 ─────────────────────────────────────────────────────────────

// 中文注释：UUID 格式校验——starred_repos.id 是 uuid 列，传入非 UUID 字符串（如 "owner/repo"）
// 会让 Postgres 抛 "invalid input syntax for type uuid"。在查 id 前先校验格式，避免这个错误。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @internal 测试可见，不是公共 API */
export async function resolveTargetRepo(userId: string, repo: string): Promise<RepoRow | null> {
  const db = getDb();

  // 按 id 精确匹配——仅当输入是合法 UUID 时才查，避免对 fullName 输入触发 uuid 类型错误
  if (UUID_RE.test(repo)) {
    const byId = await db.query.starredRepos.findFirst({
      where: and(eq(starredRepos.userId, userId), eq(starredRepos.id, repo)),
    });
    if (byId) return byId;
  }

  // 按 fullName 匹配
  const byFullName = await db.query.starredRepos.findFirst({
    where: and(eq(starredRepos.userId, userId), eq(starredRepos.fullName, repo)),
  });
  return byFullName ?? null;
}

// ─── 候选召回 ─────────────────────────────────────────────────────────────────

// 召回同 owner 的其他仓库
/** @internal 测试可见，不是公共 API */
export async function recallByOwner(userId: string, ownerLogin: string, excludeId: string): Promise<RepoRow[]> {
  const db = getDb();
  return db
    .select()
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        eq(starredRepos.ownerLogin, ownerLogin),
        ne(starredRepos.id, excludeId),
      ),
    )
    .limit(MAX_RECALL_PER_DIMENSION);
}

// 召回同 language 的其他仓库
/** @internal 测试可见，不是公共 API */
export async function recallByLanguage(userId: string, language: string | null, excludeId: string): Promise<RepoRow[]> {
  if (!language) return [];
  const db = getDb();
  return db
    .select()
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        eq(starredRepos.language, language),
        ne(starredRepos.id, excludeId),
      ),
    )
    .limit(MAX_RECALL_PER_DIMENSION);
}

// 中文注释：召回同 topic 的其他仓库。
// topics 字段是 jsonb，存储形如 ["rag","vector-db"]。我们用 topics::text ilike '%"rag"%'
// 在序列化后的 JSON 字符串上做包含匹配——能精确匹配到 topic 字符串边界（双引号包裹），
// 避免误匹配子串（如 "rag" 不会匹配 "storage"）。
// 防注入：topic 命名规范是字母数字+连字符/点/下划线，只保留这些字符。
/** @internal 测试可见，不是公共 API */
export async function recallByTopics(userId: string, topics: string[], excludeId: string): Promise<RepoRow[]> {
  if (topics.length === 0) return [];
  const safeTopics = topics
    .map((t) => t.replace(/[^a-zA-Z0-9.\-_]/g, ""))
    .filter((t) => t.length > 0)
    .slice(0, 5);
  if (safeTopics.length === 0) return [];

  // 用 OR 链组合多个 topic 条件
  const topicConditions = safeTopics.map((topic) =>
    sql`${starredRepos.topics}::text ilike ${`%"${topic}"%`}`,
  );

  const db = getDb();
  return db
    .select()
    .from(starredRepos)
    .where(
      and(
        eq(starredRepos.userId, userId),
        eq(starredRepos.isStarred, true),
        ne(starredRepos.id, excludeId),
        or(...topicConditions)!,
      ),
    )
    .limit(MAX_RECALL_PER_DIMENSION);
}

// ─── AI 重排 ────────────────────────────────────────────────────────────────

function buildRelatedSystemPrompt(): string {
  return `你是 Starlens 的关联仓库推荐助手。给定一个目标仓库和一组候选仓库（按 owner/topic/language 维度召回），你需要：
1. 判断每个候选与目标的真实关联强度
2. 按关联强度降序排序
3. 为每个保留的候选用一句中文说明"为什么相关"

严格规则：
- 只能从候选列表中选择，不能凭空生成
- 必须返回 JSON：{ "items": [{ "id": string, "relation": string }] }
- relation 必须基于实际信息（同 owner / 同 topic / 同 language / 语义相似）
- 不要包含任何 JSON 之外的文字、不要包裹 markdown code fence
- 候选都不相关时返回 { "items": [] }`;
}

function buildRelatedUserPrompt(target: RepoRow, candidates: RepoRow[]): string {
  const targetText = [
    `目标仓库：${target.fullName}`,
    `  语言: ${target.language || "unknown"}`,
    `  Topics: ${(target.topics ?? []).join(", ") || "无"}`,
    `  简介: ${target.description ?? "无"}`,
  ].join("\n");

  const candidateText = candidates
    .map((c, idx) => {
      const parts = [`[${idx + 1}] id=${c.id} | ${c.fullName} | stars=${c.stargazersCount}`];
      parts.push(`   lang: ${c.language || "unknown"}`);
      parts.push(`   topics: ${(c.topics ?? []).join(", ") || "无"}`);
      if (c.description) parts.push(`   description: ${c.description.slice(0, 150)}`);
      if (c.repoSummary) parts.push(`   summary: ${c.repoSummary.slice(0, 150)}`);
      return parts.join("\n");
    })
    .join("\n\n");

  return `${targetText}

候选仓库（去重后）：
${candidateText}

请按与目标的关联强度排序，并为每个保留的候选生成一句中文 relation。`;
}

/** @internal AI 输出结构——测试可见，不是公共 API */
export type AiRelatedOutput = { items: Array<{ id: string; relation: string }> };

/** @internal 测试可见，不是公共 API */
export function parseAiRelatedOutput(raw: string | null): AiRelatedOutput | null {
  if (!raw) return null;

  const cleaned = stripThinkBlocks(raw).trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : cleaned;

  try {
    const parsed = JSON.parse(jsonText) as Partial<AiRelatedOutput>;
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items
        .filter((item): item is { id: string; relation: string } =>
          typeof item === "object" && item !== null &&
          typeof item.id === "string" && typeof item.relation === "string")
        .map((item) => ({ id: item.id, relation: item.relation.trim() })),
    };
  } catch (error) {
    // AI 返回非 JSON 时降级为不重排——直接按召回顺序返回。
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/related] AI output JSON parse failed: error=${msg} raw=${cleaned.slice(0, 200)}`);
    return null;
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

export async function findRelated(
  userId: string,
  input: FindRelatedInput,
  chatConfig: ChatRuntimeConfig,
): Promise<FindRelatedResult> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // 1. 解析目标仓库。
  const target = await resolveTargetRepo(userId, input.repo);
  if (!target) {
    return {
      data: { items: [] },
      meta: { empty: true, hint: `未在你的收藏中找到仓库：${input.repo}` },
      suggestedNextActions: [],
      reasoningHints: "目标仓库未在 starred_repos 中找到，无法查找相关仓库。",
    };
  }

  // 2. 多维度召回候选。
  const [byOwner, byLanguage, byTopics] = await Promise.all([
    recallByOwner(userId, target.ownerLogin, target.id),
    recallByLanguage(userId, target.language, target.id),
    recallByTopics(userId, target.topics ?? [], target.id),
  ]);

  // 去重：同一仓库可能被多个维度召回，记录召回原因。
  const candidateMap = new Map<string, { row: RepoRow; reasons: Set<string> }>();
  for (const row of byOwner) {
    const entry = candidateMap.get(row.id) ?? { row, reasons: new Set<string>() };
    entry.reasons.add("同 owner");
    candidateMap.set(row.id, entry);
  }
  for (const row of byLanguage) {
    const entry = candidateMap.get(row.id) ?? { row, reasons: new Set<string>() };
    entry.reasons.add("同 language");
    candidateMap.set(row.id, entry);
  }
  for (const row of byTopics) {
    const entry = candidateMap.get(row.id) ?? { row, reasons: new Set<string>() };
    entry.reasons.add("同 topic");
    candidateMap.set(row.id, entry);
  }

  if (candidateMap.size === 0) {
    return {
      data: { items: [] },
      meta: { empty: true, hint: "未找到与目标仓库相关的其他收藏。" },
      suggestedNextActions: [],
      reasoningHints: `目标仓库 ${target.fullName} 的 owner/language/topics 维度均未召回到其他仓库。`,
    };
  }

  const candidates = Array.from(candidateMap.values()).map(({ row, reasons }) => ({
    row,
    reasons: Array.from(reasons),
  }));

  // 3. 调用 AI 重排——基于目标仓库和候选列表做语义关联判断。
  const messages: AgentChatMessage[] = [
    { role: "system", content: buildRelatedSystemPrompt() },
    { role: "user", content: buildRelatedUserPrompt(target, candidates.map((c) => c.row)) },
  ];

  const turn = await callChatCompletionsWithTools({
    messages,
    tools: [],
    config: chatConfig,
    userId,
    maxTokens: 800,
  });

  const aiOutput = parseAiRelatedOutput(turn?.content ?? null);

  // 4. 按 AI 排序组装结果（失败则降级为按召回顺序返回）。
  const rowById = new Map(candidates.map((c) => [c.row.id, c] as const));
  const aiRelationById = new Map((aiOutput?.items ?? []).map((item) => [item.id, item.relation] as const));

  // 排序：AI 输出顺序优先；未在 AI 输出中的候选按召回顺序排在最后。
  const orderedIds = aiOutput && aiOutput.items.length > 0
    ? aiOutput.items.map((item) => item.id)
    : candidates.map((c) => c.row.id);

  const items: RelatedItem[] = [];
  for (const id of orderedIds) {
    const candidate = rowById.get(id);
    if (!candidate) continue;
    const aiRelation = aiRelationById.get(id);
    const relation = aiRelation && aiRelation.length > 0
      ? aiRelation
      : `召回原因：${candidate.reasons.join("、")}`;

    items.push({
      id: candidate.row.id,
      fullName: candidate.row.fullName,
      description: candidate.row.description ?? "",
      htmlUrl: candidate.row.htmlUrl,
      stargazersCount: candidate.row.stargazersCount,
      language: candidate.row.language ?? "",
      topics: candidate.row.topics ?? [],
      tags: [], // tags 需要单独查询 repo_tags 表，本期不展开——agent 可后续调 show_star 获取
      note: "",
      relation,
    });
    if (items.length >= limit) break;
  }

  // 5. suggestedNextActions：建议 agent 用 show_star 查看最相关仓库的详情。
  const suggestedNextActions: FindRelatedResult["suggestedNextActions"] = [];
  if (items.length > 0) {
    suggestedNextActions.push({
      tool: "show_star",
      args: { repo: items[0].id },
      reason: "查看最相关仓库的详情以确认是否真的相关。",
    });
  }

  const reasoningHints = aiOutput && aiOutput.items.length > 0
    ? `从 owner/language/topic 三维度召回 ${candidates.length} 个候选，AI 重排后保留 ${items.length} 个。`
    : `从 owner/language/topic 三维度召回 ${candidates.length} 个候选，AI 重排失败，已按召回顺序降级返回。`;

  return {
    data: { items },
    meta: { empty: false },
    suggestedNextActions,
    reasoningHints,
  };
}
