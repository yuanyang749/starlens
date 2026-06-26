// 回答拼装与分支回答策略
// 负责：根据 QueryIntent 分发到对应处理函数，组装最终回答

import { getRepoDetail, getRepoStats, searchRepos } from "@starlens/server/server/repos/repository";
import {
  type ChatRuntimeConfig,
  type QueryIntent,
  type RecalledCandidate,
  type SearchRepoItem,
  type StructuredIntent,
} from "./types";
import { askProvider, callAIWithPrompt, wrapUserQuestion } from "./provider";
import { buildFilterDesc, buildSingleRepoContext, toRecalledCandidate } from "./ranking";
import { recallCandidates } from "./recall";

export type AskResult = {
  answer: string;
  candidates: RecalledCandidate[];
};

// 将 StructuredIntent 中的 ISO 字符串转换为 Date 对象
function parseSI(si: StructuredIntent) {
  return {
    ...si,
    starredAfter: si.starredAfter ? new Date(si.starredAfter) : undefined,
    starredBefore: si.starredBefore ? new Date(si.starredBefore) : undefined,
    pushedAfter: si.pushedAfter ? new Date(si.pushedAfter) : undefined,
  };
}

// ─── count ────────────────────────────────────────────────────────────────────

async function handleCount(
  intent: Extract<QueryIntent, { kind: "count" }>,
  userId: string,
): Promise<AskResult> {
  const si = intent.filter ?? {};
  const result = await searchRepos(userId, { ...parseSI(si), pageSize: 1, page: 1 });
  const desc = buildFilterDesc(si);
  return {
    answer: `你的收藏中${desc}共有 **${result.total}** 个仓库。`,
    candidates: [],
  };
}

// ─── existence ───────────────────────────────────────────────────────────────

async function handleExistence(
  intent: Extract<QueryIntent, { kind: "existence" }>,
  userId: string,
): Promise<AskResult> {
  const result = await searchRepos(userId, { ...parseSI(intent.filter), q: intent.query, sort: "relevance", pageSize: 5 });
  if (result.total === 0) {
    return {
      answer: `在你的收藏中**未找到**与「${intent.query}」相关的仓库。`,
      candidates: [],
    };
  }
  const list = result.items.slice(0, 3).map((r) => `- **${r.fullName}**（${(r.stargazersCount ?? 0).toLocaleString()} ⭐）`).join("\n");
  return {
    answer: `找到 **${result.total}** 个相关仓库：\n${list}`,
    candidates: result.items.slice(0, 3).map((r, i) => toRecalledCandidate(r, i, "匹配存在性查询")),
  };
}

// ─── comparison ──────────────────────────────────────────────────────────────

async function handleComparison(
  intent: Extract<QueryIntent, { kind: "comparison" }>,
  question: string,
  userId: string,
  chatConfig: ChatRuntimeConfig | null,
): Promise<AskResult> {
  const [resA, resB] = await Promise.all([
    searchRepos(userId, { q: intent.repoA, sort: "relevance", pageSize: 3 }),
    searchRepos(userId, { q: intent.repoB, sort: "relevance", pageSize: 3 }),
  ]);
  const repoA = resA.items.find((r) => r.fullName?.toLowerCase().includes(intent.repoA.toLowerCase())) ?? resA.items[0];
  const repoB = resB.items.find((r) => r.fullName?.toLowerCase().includes(intent.repoB.toLowerCase())) ?? resB.items[0];

  if (!repoA && !repoB) {
    return {
      answer: `「${intent.repoA}」和「${intent.repoB}」在你的收藏中均未找到，请确认是否已收藏这两个仓库。`,
      candidates: [],
    };
  }

  const [detailA, detailB] = await Promise.all([
    repoA ? (getRepoDetail(userId, repoA.id)) : Promise.resolve(null),
    repoB ? (getRepoDetail(userId, repoB.id)) : Promise.resolve(null),
  ]);

  const contextParts = [
    detailA ? `【${detailA.fullName}】\n${buildSingleRepoContext(detailA)}` : `未找到「${intent.repoA}」`,
    detailB ? `【${detailB.fullName}】\n${buildSingleRepoContext(detailB)}` : `未找到「${intent.repoB}」`,
  ].join("\n\n---\n\n");

  const answer = await callAIWithPrompt({
    system: "你是仓库对比分析师。基于两个仓库的信息，用中文给出结构化对比：1) 核心定位差异；2) 适用场景；3) 优缺点对比；4) 推荐结论（说明哪个更适合用户的问题）。",
    user: `${wrapUserQuestion(question)}\n\n${contextParts}`,
    maxTokens: 700, config: chatConfig, userId, endpoint: "ask/comparison",
  }) ?? `对比 ${detailA?.fullName ?? intent.repoA} 和 ${detailB?.fullName ?? intent.repoB}：请参考两仓库详情。`;

  const cands = [detailA, detailB].filter(Boolean).map((r, i) =>
    toRecalledCandidate(r as SearchRepoItem, i, "用于对比分析")
  );
  return { answer, candidates: cands };
}

// ─── stats ───────────────────────────────────────────────────────────────────

async function handleStats(
  question: string,
  userId: string,
  chatConfig: ChatRuntimeConfig | null,
): Promise<AskResult> {
  const stats = await getRepoStats(userId);
  const topLangs = stats.byLanguage.slice(0, 8)
    .map((l, i) => `${i + 1}. ${l.language}：${l.count} 个`)
    .join("\n");
  const fallback = [
    `你的收藏共 **${stats.total}** 个仓库，其中 **${stats.totalFavorites}** 个标记为收藏。`,
    `\n**语言分布 Top ${Math.min(stats.byLanguage.length, 8)}：**\n${topLangs}`,
    stats.mostStarredRepo ? `\n**Star 最多：** ${stats.mostStarredRepo.fullName}（${stats.mostStarredRepo.stargazersCount.toLocaleString()} ⭐）` : "",
  ].join("");

  const answer = await callAIWithPrompt({
    system: "你是数据分析助手。基于用户的 GitHub 收藏统计，用中文给出简洁的分析：主要技术偏好、收藏亮点、可能的学习方向建议。",
    user: `总仓库数：${stats.total}，收藏数：${stats.totalFavorites}\n语言分布：\n${topLangs}\nStar 最多：${stats.mostStarredRepo?.fullName ?? "无"}（${stats.mostStarredRepo?.stargazersCount.toLocaleString() ?? 0} ⭐）\n${wrapUserQuestion(question)}`,
    maxTokens: 400, config: chatConfig, userId, endpoint: "ask/stats",
  }) ?? fallback;

  return { answer, candidates: [] };
}

// ─── recommendation ───────────────────────────────────────────────────────────

async function handleRecommendation(
  intent: Extract<QueryIntent, { kind: "recommendation" }>,
  question: string,
  userId: string,
  chatConfig: ChatRuntimeConfig | null,
): Promise<AskResult> {
  const [stats, recentStars] = await Promise.all([
    getRepoStats(userId),
    searchRepos(userId, { sort: "recent", pageSize: 15 }),
  ]);
  const topicSet = [...new Set(recentStars.items.flatMap((r) => r.topics ?? []))].slice(0, 10);
  const userProfile = [
    `语言偏好：${stats.byLanguage.slice(0, 3).map((l) => l.language).join("、") || "未知"}`,
    `近期收藏话题：${topicSet.join("、") || "无"}`,
    `总收藏：${stats.total} 个，收藏：${stats.totalFavorites} 个`,
  ].join("；");

  const answer = await callAIWithPrompt({
    system: "你是 GitHub 仓库推荐助手。基于用户的收藏偏好画像和推荐需求，给出 3-5 个方向性建议。重要：不要随意捏造具体仓库名，只给出技术方向、学习路径和寻找方式。",
    user: `用户画像：${userProfile}\n推荐需求：${intent.context}\n${wrapUserQuestion(question)}`,
    maxTokens: 500, config: chatConfig, userId, endpoint: "ask/recommendation",
  }) ?? "根据你的收藏偏好，建议关注你常用语言相关的工具链、框架和最佳实践仓库。";

  return { answer, candidates: [] };
}

// ─── single_repo ──────────────────────────────────────────────────────────────

async function handleSingleRepo(
  intent: Extract<QueryIntent, { kind: "single_repo" }>,
  question: string,
  userId: string,
  chatConfig: ChatRuntimeConfig | null,
): Promise<AskResult> {
  const searchResult = await searchRepos(userId, { q: intent.repoIdentifier, sort: "relevance", pageSize: 5 });
  const matched = searchResult.items.find((r) => r.fullName?.toLowerCase() === intent.repoIdentifier.toLowerCase()) ?? searchResult.items[0];

  if (!matched) {
    return {
      answer: `在你的收藏中未找到仓库「${intent.repoIdentifier}」，请先确认该仓库是否已收藏。`,
      candidates: [],
    };
  }

  const repoDetail = await getRepoDetail(userId, matched.id) ?? matched;
  const context = buildSingleRepoContext(repoDetail);

  const answer = await callAIWithPrompt({
    system: "你是仓库分析助手。基于提供的仓库信息，用中文给出精炼、实用的回答。重点包括：用途与核心功能、使用方法、典型场景、优缺点（如有）。回答要具体，避免空话。",
    user: `${wrapUserQuestion(question)}\n\n仓库详情：\n${context}`,
    maxTokens: 600, config: chatConfig, userId, endpoint: "ask/single_repo",
  }) ?? `关于仓库 ${repoDetail.fullName}：${repoDetail.description ?? repoDetail.repoSummary ?? ""}`;

  return {
    answer,
    candidates: [toRecalledCandidate(repoDetail as SearchRepoItem, 0, "精确匹配用户指定仓库")],
  };
}

// ─── structured ───────────────────────────────────────────────────────────────

async function recallStructured(
  intent: Extract<QueryIntent, { kind: "structured" }>,
  userId: string,
): Promise<RecalledCandidate[]> {
  const si = intent.intent;
  const result = await searchRepos(userId, {
    page: 1,
    pageSize: Math.min(si.topN ?? 10, 20),
    sort: si.sort ?? "relevance",
    language: si.language,
    owner: si.owner,
    favorite: si.favorite,
    tag: si.tag,
    q: si.q,
    minStars: si.minStars,
    maxStars: si.maxStars,
    starredAfter: si.starredAfter ? new Date(si.starredAfter) : undefined,
    starredBefore: si.starredBefore ? new Date(si.starredBefore) : undefined,
    pushedAfter: si.pushedAfter ? new Date(si.pushedAfter) : undefined,
    hasNote: si.hasNote,
    noteContains: si.noteContains,
  });

  const sortLabel =
    si.sort === "stars" ? "按 Star 数降序" :
    si.sort === "updated" ? "按最近推送时间降序" :
    si.sort === "recent" ? "按收藏时间降序" : "按相关性";

  return result.items.map((item, index) =>
    toRecalledCandidate(item, index, `${sortLabel}${buildFilterDesc(si)}，第 ${index + 1} 名（${(item.stargazersCount ?? 0).toLocaleString()} ⭐）`)
  );
}

// ─── structured 与 semantic 共享的精排流程 ──────────────────────────────────────

async function handleStructuredOrSemantic(
  intent: QueryIntent,
  question: string,
  userId: string,
  chatConfig: ChatRuntimeConfig | null,
): Promise<AskResult> {
  let candidates: RecalledCandidate[];
  let queries: string[];

  if (intent.kind === "structured") {
    candidates = await recallStructured(intent, userId);
    queries = [question];
  } else {
    const recalled = await recallCandidates(userId, question, chatConfig);
    candidates = recalled.candidates;
    queries = recalled.queries;
  }

  const hasCandidates = candidates.length > 0;

  let answer =
    hasCandidates
      ? `已检索到 ${candidates.length} 个匹配仓库，最相关的是 ${candidates[0]?.fullName ?? "未知仓库"}。`
      : `未找到匹配仓库。可尝试这些关键词：${queries.slice(0, 4).join(" / ")}`;

  if (hasCandidates) {
    try {
      const aiAnswer = await askProvider(question, candidates, chatConfig, userId);
      if (aiAnswer) answer = aiAnswer;
    } catch {
      // Ignore provider failures and fall back to deterministic local answer.
    }
  }

  return { answer, candidates };
}

// ─── 分发入口 ─────────────────────────────────────────────────────────────────

export async function handleAskBranch(
  intent: QueryIntent,
  question: string,
  userId: string,
  chatConfig: ChatRuntimeConfig | null,
): Promise<AskResult> {
  switch (intent.kind) {
    case "count":
      return handleCount(intent, userId);
    case "existence":
      return handleExistence(intent, userId);
    case "comparison":
      return handleComparison(intent, question, userId, chatConfig);
    case "stats":
      return handleStats(question, userId, chatConfig);
    case "recommendation":
      return handleRecommendation(intent, question, userId, chatConfig);
    case "single_repo":
      return handleSingleRepo(intent, question, userId, chatConfig);
    case "structured":
    default:
      // 中文注释：structured 和 semantic 共享精排流程，保持与原始行为一致
      return handleStructuredOrSemantic(intent, question, userId, chatConfig);
  }
}
