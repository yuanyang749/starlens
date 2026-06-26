// 候选召回层
// 负责：从关键词、启发式、AI 扩展三个维度召回候选仓库

import { searchRepos, searchReposRanked } from "@starlens/server/server/repos/repository";
import {
  type Candidate,
  type CandidateSource,
  type ChatRuntimeConfig,
  type QueryKind,
  type QuerySpec,
  type RecalledCandidate,
  BROAD_POOL_SIZE,
  CANDIDATE_LIMIT,
  RECALL_PER_KEYWORD,
  TS_RANK_THRESHOLD,
} from "./types";
import { expandQuestionTermsWithProvider, pickCandidatesWithProvider } from "./provider";
import { toCandidate } from "./ranking";

// ─── 启发式与查询扩展 ──────────────────────────────────────────────────────────

function buildHeuristicTerms(question: string) {
  const terms: string[] = [];
  const mapping: Array<{ pattern: RegExp; terms: string[] }> = [
    { pattern: /(图像|图片|照片|视觉|cv)/i, terms: ["image processing", "computer vision", "opencv"] },
    { pattern: /(视频|音视频|剪辑|转场|字幕)/i, terms: ["video processing", "ffmpeg", "multimedia"] },
    { pattern: /(语音|音频|tts|asr)/i, terms: ["speech", "audio processing", "tts asr"] },
    { pattern: /(前端|界面|ui|组件)/i, terms: ["frontend", "ui components", "react"] },
    { pattern: /(后端|接口|api|服务)/i, terms: ["backend", "api service", "server"] },
    { pattern: /(检索|搜索|向量|rag)/i, terms: ["search", "retrieval", "rag"] },
    { pattern: /(代理|智能体|agent)/i, terms: ["ai agent", "agent framework", "automation"] },
  ];
  for (const entry of mapping) {
    if (entry.pattern.test(question)) terms.push(...entry.terms);
  }
  return Array.from(new Set(terms));
}

function uniqueQuerySpecs(specs: QuerySpec[]) {
  const seen = new Set<string>();
  const unique: QuerySpec[] = [];
  for (const spec of specs) {
    const normalized = spec.query.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ ...spec, query: spec.query.trim() });
  }
  return unique;
}

function sourceForQueryKind(kind: QueryKind): CandidateSource {
  if (kind === "question") return "question_search";
  if (kind === "heuristic") return "heuristic_search";
  return "expanded_search";
}

function reasonForQuerySpec(spec: QuerySpec) {
  if (spec.kind === "question") return `Matched your question directly: "${spec.query}".`;
  if (spec.kind === "heuristic") return `Matched heuristic term: "${spec.query}".`;
  return `Matched expanded term: "${spec.query}".`;
}

function baseScoreForQueryKind(kind: QueryKind) {
  if (kind === "question") return 1000;
  if (kind === "heuristic") return 700;
  return 400;
}

function splitSearchTerms(terms: string[]) {
  return terms
    .flatMap((term) => term.toLowerCase().split(/\s+/g))
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function heuristicPickFromPool(question: string, pool: Candidate[]) {
  const mappedTerms = splitSearchTerms(buildHeuristicTerms(question));
  if (mappedTerms.length === 0) return [];
  const picked = pool.filter((item) => {
    const haystack = [item.fullName, item.description, item.repoSummary, item.aiSummary ?? "", item.tags.join(" "), item.topics.join(" "), item.userNote, item.language]
      .join(" ").toLowerCase();
    return mappedTerms.some((term) => haystack.includes(term));
  });
  return picked.slice(0, 8);
}

// 从问题中提取 ASCII 关键词，处理"中文问题夹带英文技术词"场景（如"关于gpt image的仓库"→["gpt","image"]）
function extractAsciiTerms(question: string): string[] {
  const stopwords = new Set(["the", "and", "for", "are", "was", "with", "that", "this", "have", "from"]);
  return question
    .split(/[一-鿿　-〿＀-￯\s，。、！？；：]+/)
    .flatMap((chunk) => chunk.split(/[^a-zA-Z0-9._-]+/))
    .map((t) => t.trim().toLowerCase().replace(/^[-._]+|[-._]+$/g, ""))
    .filter((t) => t.length >= 2 && /[a-z]/i.test(t) && !stopwords.has(t));
}

function mergeCandidate(
  merged: Map<string, RecalledCandidate>,
  candidate: Candidate,
  metadata: Pick<RecalledCandidate, "reason" | "score" | "source">,
) {
  const existing = merged.get(candidate.id);
  if (
    !existing
    || metadata.score > existing.score
    || (metadata.score === existing.score && candidate.tsRank > existing.tsRank)
  ) {
    merged.set(candidate.id, { ...candidate, ...metadata });
  }
}

// ─── 召回主流程 ────────────────────────────────────────────────────────────────

// 中文注释：召回层 — 每个关键词取 20 条，过滤 ts_rank < 阈值的低置信度结果，候选上限 20。
export async function recallCandidates(userId: string, question: string, config: ChatRuntimeConfig | null) {
  const querySpecs = uniqueQuerySpecs([
    { query: question, kind: "question" },
    ...buildHeuristicTerms(question).map((query) => ({ query, kind: "heuristic" as const })),
    // 中文注释：从问题中提取 ASCII 关键词作为补充查询，处理"中文问句夹英文技术词"场景，无需 AI 也能召回。
    ...extractAsciiTerms(question).map((query) => ({ query, kind: "heuristic" as const })),
    ...(await expandQuestionTermsWithProvider(question, config, userId)).map((query) => ({ query, kind: "expanded" as const })),
  ]).slice(0, 10);

  const merged = new Map<string, RecalledCandidate>();

  for (const spec of querySpecs) {
    const items = await searchReposRanked(userId, spec.query, RECALL_PER_KEYWORD);

    for (const [index, item] of items.entries()) {
      const candidate = toCandidate(item);
      // 中文注释：ts_rank < 阈值说明仅靠 ilike 模糊匹配命中，置信度低，过滤掉。
      if (candidate.tsRank < TS_RANK_THRESHOLD) continue;

      const tsBonus = Math.round(candidate.tsRank * 200);
      mergeCandidate(merged, candidate, {
        source: sourceForQueryKind(spec.kind),
        reason: reasonForQuerySpec(spec),
        score: baseScoreForQueryKind(spec.kind) - index * 8 + tsBonus,
      });
    }

    if (merged.size >= CANDIDATE_LIMIT) break;
  }

  let candidates = Array.from(merged.values())
    .sort((left, right) => right.score - left.score || right.tsRank - left.tsRank)
    .slice(0, CANDIDATE_LIMIT);

  if (candidates.length === 0) {
    // 中文注释：P2 — broadPool 扩至 100 条，给 pick 和 heuristic 更大搜索空间。
    const broadPoolResult = await searchRepos(userId, {
      page: 1,
      pageSize: BROAD_POOL_SIZE,
      sort: "recent",
    });
    const broadPool = broadPoolResult.items.map(toCandidate);

    candidates = heuristicPickFromPool(question, broadPool).map((candidate, index) => ({
      ...candidate,
      source: "heuristic_pool" as const,
      reason: "Matched heuristic terms against recent repository metadata.",
      score: 250 - index * 10,
    }));

    if (candidates.length === 0) {
      candidates = (await pickCandidatesWithProvider(question, broadPool, config, userId)).map((candidate, index) => ({
        ...candidate,
        source: "ai_pool_pick" as const,
        reason: "Selected by AI fallback from recent repository candidates.",
        score: 150 - index * 10,
      }));
    }
  }

  return {
    candidates,
    queries: querySpecs.map((spec) => spec.query),
  };
}
