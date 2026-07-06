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
  Pick<AiRuntimeConfig, "apiKey" | "baseUrl" | "extraHeaders" | "fallbackModel" | "id" | "model" | "providerType">,
  "baseUrl"
> & { baseUrl: string };

// ─── 候选展示上限 ────────────────────────────────────────────────────────────

export const ANSWER_CANDIDATE_LIMIT = 15;

export const MAX_QUESTION_LENGTH = 1000;

// ─── Agent 工具调用循环 ──────────────────────────────────────────────────────

// 中文注释：原值 6 经调试脚本（scripts/debug-ai-ask.ts）实测发现不够用——模糊问题（如"哪些仓库
// 适合做本地 agent 工具"）走完 search_repos 换角度探索 + get_repo_detail 确认 + submit_answer
// 的正常流程就要 7~8 轮，6 轮会在 submit_answer 之前被硬性截断，误判为"没有找到匹配的仓库"。
// 当前用户量还小，产品阶段优先保成功率，成本不是约束——放宽到 20，配合 loop.ts 里的
// "剩余轮次预警"提醒机制，避免真的跑满。上限对应的耗时由 AGENT_LOOP_TIMEOUT_MS 兜底
// （反向代理超时默认值未单独覆盖，见 agent/index.ts 的注释）。
export const MAX_AGENT_ITERATIONS = 20;
