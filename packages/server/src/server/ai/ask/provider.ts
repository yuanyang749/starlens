// OpenAI-compatible Provider 请求封装
// 统一管理：URL 解析、请求头组装、think 块清理、usage 上报

import { type AiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { trackAiUsage } from "@starlens/server/server/ai/usage-buffer";
import { guardedFetch } from "@starlens/server/server/security/url-guard";
import {
  type Candidate,
  type ChatRuntimeConfig,
  type OpenAiCompatibleResponse,
  PICK_POOL_LIMIT,
  ANSWER_CANDIDATE_LIMIT,
} from "./types";
import { buildCandidateContext } from "./ranking";

// ─── 运行时配置解析 ────────────────────────────────────────────────────────────

export function asChatRuntimeConfig(config: AiRuntimeConfig | null): ChatRuntimeConfig | null {
  if (!config?.baseUrl?.trim()) return null;
  return { ...config, baseUrl: config.baseUrl };
}

export function resolveChatCompletionsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/v1")
    ? `${normalizedPath}/chat/completions`
    : `${normalizedPath}/v1/chat/completions`;
  return url.toString();
}

// ─── 文本处理工具 ──────────────────────────────────────────────────────────────

export function stripThinkBlocks(text: string | null) {
  if (!text) return "";
  return text.replace(/<think[\s\S]*?<\/think>/gi, " ").trim();
}

// 用 XML 标签隔离用户输入，防止 prompt injection
export function wrapUserQuestion(question: string): string {
  return `<question>\n${question}\n</question>`;
}

// ─── 统一 AI 调用封装 ──────────────────────────────────────────────────────────

export async function callAIWithPrompt({
  system, user: userContent, maxTokens = 400, config, userId, endpoint,
}: {
  system: string; user: string; maxTokens?: number;
  config: ChatRuntimeConfig | null; userId?: string; endpoint: string;
}): Promise<string | null> {
  if (!config) return null;
  try {
    const response = await guardedFetch(resolveChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, temperature: 0.3, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as OpenAiCompatibleResponse;
    if (userId) {
      trackAiUsage({ userId, endpoint, model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
    }
    return stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null).replace(/\s+/g, " ").trim() || null;
  } catch { return null; }
}

// ─── 召回辅助 AI 调用 ──────────────────────────────────────────────────────────

export async function expandQuestionTermsWithProvider(question: string, config: ChatRuntimeConfig | null, userId?: string) {
  if (!config) return [];

  const response = await guardedFetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 150,
      messages: [
        {
          role: "system",
          content: "把用户检索意图转成最多8个技术关键词或短语，偏英文，逗号分隔，只输出关键词，不要解释。",
        },
        { role: "user", content: wrapUserQuestion(question) },
      ],
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  if (userId) {
    trackAiUsage({ userId, endpoint: "ask/expand", model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
  }
  const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
  if (!raw) return [];

  return raw
    .split(/[,\n，、;；]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 40)
    .slice(0, 8);
}

// 中文注释：P2 — pick 池从 30 扩至 50，compact 数据加入 aiSummary 和用户标签，提升精排准确度。
export async function pickCandidatesWithProvider(question: string, pool: Candidate[], config: ChatRuntimeConfig | null, userId?: string) {
  if (!config || pool.length === 0) return [];

  const compactPool = pool.slice(0, PICK_POOL_LIMIT).map((item, index) => ({
    idx: index + 1,
    id: item.id,
    fullName: item.fullName,
    language: item.language,
    summary: item.aiSummary?.trim() || item.repoSummary?.trim() || item.description?.trim() || "",
    tags: item.tags.length > 0 ? item.tags : item.topics.slice(0, 5),
    note: item.userNote || undefined,
  }));

  const response = await guardedFetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content: "你是仓库筛选助手。根据用户问题，从候选仓库里选最相关的1到10个，输出JSON：{\"ids\":[\"id1\",\"id2\"]}。只输出JSON。",
        },
        { role: "user", content: `${wrapUserQuestion(question)}\n候选池：${JSON.stringify(compactPool)}` },
      ],
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  if (userId) {
    trackAiUsage({ userId, endpoint: "ask/pick", model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
  }
  const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
  if (!raw) return [];

  const idsMatch = raw.match(/"ids"\s*:\s*\[([^\]]*)]/);
  if (!idsMatch) return [];
  const ids = idsMatch[1].split(",").map((item) => item.replace(/["'\s]/g, "")).filter(Boolean);
  if (ids.length === 0) return [];

  const byId = new Map(pool.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
}

// ─── 精排 Provider 调用 ────────────────────────────────────────────────────────

// 中文注释：精排层 — 最多 15 条富文本候选，增大 max_tokens 以支持更多候选的详细回答。
export async function askProvider(question: string, candidates: Candidate[], config: ChatRuntimeConfig | null, userId?: string) {
  if (!config) return null;

  const topCandidates = candidates.slice(0, ANSWER_CANDIDATE_LIMIT);

  const response = await guardedFetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "你是仓库检索助手。基于候选仓库给出精炼中文结论：1) 列出最匹配的1到3个仓库及一句话理由；2) 对于「star 最多」「最受欢迎」等排序类问题，直接按候选列表中 Stars 字段排名给出答案，无需猜测；3) 若候选中有用户自己备注或标签过的仓库，优先推荐；4) 若无明显匹配则明确说明。",
        },
        {
          role: "user",
          content: `${wrapUserQuestion(question)}\n\n候选仓库：\n${buildCandidateContext(topCandidates)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  if (userId) {
    trackAiUsage({ userId, endpoint: "ask/answer", model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
  }
  const content = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null)
    .replace(/\s+/g, " ")
    .trim();
  return content || null;
}


