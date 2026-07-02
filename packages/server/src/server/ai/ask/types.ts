// AI 问答链路共享类型定义

import type { AiRuntimeConfig } from "@starlens/server/server/ai/configs";
import type { searchRepos } from "@starlens/server/server/repos/repository";

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

export type CandidateSource = "agent_tool_result";

export type RecalledCandidate = Candidate & {
  reason: string;
  score: number;
  source: CandidateSource;
};

export type AskResult = {
  answer: string;
  candidates: RecalledCandidate[];
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

export type ChatRuntimeConfig = Omit<
  Pick<AiRuntimeConfig, "apiKey" | "baseUrl" | "extraHeaders" | "id" | "model" | "providerType">,
  "baseUrl"
> & { baseUrl: string };

// ─── 候选展示上限 ────────────────────────────────────────────────────────────

export const ANSWER_CANDIDATE_LIMIT = 15;

export const MAX_QUESTION_LENGTH = 1000;

// ─── Agent 工具调用循环 ──────────────────────────────────────────────────────

// 覆盖"1 次搜索 + 最多 2 次仓库详情 + 1 次统计 + 1 次 submit_answer"的现实场景，
// 还留 1 次给"第一轮没调工具"的纠正重试。成本不是约束，这里放宽是为了准确率，不是为了省钱。
export const MAX_AGENT_ITERATIONS = 6;
