// AI 问答链路共享类型定义

import type { AiRuntimeConfig } from "@starlens/server/server/ai/configs";
import type { searchRepos, searchReposRanked } from "@starlens/server/server/repos/repository";

// ─── 候选仓库类型 ────────────────────────────────────────────────────────────

export type Candidate = {
  id: string;
  fullName: string;
  description: string;
  aiSummary: string | undefined;
  repoSummary: string;
  userNote: string;
  topics: string[];
  tags: string[];
  language: string;
  stargazersCount: number;
  tsRank: number;
};

export type CandidateSource =
  | "question_search"
  | "heuristic_search"
  | "expanded_search"
  | "heuristic_pool"
  | "ai_pool_pick";

export type QueryKind = "question" | "heuristic" | "expanded";

export type QuerySpec = {
  query: string;
  kind: QueryKind;
};

export type RecalledCandidate = Candidate & {
  reason: string;
  score: number;
  source: CandidateSource;
};

// ─── Provider 响应与运行时配置 ────────────────────────────────────────────────

export type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  // 中文注释：部分第三方端点可能不返回 usage，全部字段做容错处理。
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

export type SearchRepoItem = Awaited<ReturnType<typeof searchRepos>>["items"][number];
export type RankedRepoItem = Awaited<ReturnType<typeof searchReposRanked>>[number];

export type ChatRuntimeConfig = Omit<
  Pick<AiRuntimeConfig, "apiKey" | "baseUrl" | "extraHeaders" | "id" | "model" | "providerType">,
  "baseUrl"
> & { baseUrl: string };

// ─── 意图识别类型 ────────────────────────────────────────────────────────────

export type StructuredIntent = {
  sort?: "stars" | "updated" | "recent";
  topN?: number;
  language?: string;
  owner?: string;
  favorite?: boolean;
  tag?: string;
  q?: string;
  // 新增过滤维度
  minStars?: number;
  maxStars?: number;
  starredAfter?: string;   // ISO 日期字符串
  starredBefore?: string;
  pushedAfter?: string;
  hasNote?: boolean;
  noteContains?: string;
};

export type QueryIntent =
  | { kind: "structured"; intent: StructuredIntent }
  | { kind: "single_repo"; repoIdentifier: string }
  | { kind: "count"; filter: StructuredIntent }
  | { kind: "existence"; query: string; filter: StructuredIntent }
  | { kind: "comparison"; repoA: string; repoB: string }
  | { kind: "stats" }
  | { kind: "recommendation"; context: string }
  | { kind: "semantic" };

// ─── 召回常量 ────────────────────────────────────────────────────────────────

// P0: 候选上限 8→15；P1: 召回量 8→20；P2: broadPool 80→100 / pick 池 30→50
export const RECALL_PER_KEYWORD = 20;
export const CANDIDATE_LIMIT = 20;
export const BROAD_POOL_SIZE = 100;
export const PICK_POOL_LIMIT = 50;
export const ANSWER_CANDIDATE_LIMIT = 15;
export const TS_RANK_THRESHOLD = 0.01; // 低于此分数视为低置信度，不进候选池

export const MAX_QUESTION_LENGTH = 1000;
