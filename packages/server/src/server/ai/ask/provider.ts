// OpenAI-compatible Provider 请求封装
// 统一管理：URL 解析、请求头组装、think 块清理、usage 上报

import { type AiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { trackAiUsage } from "@starlens/server/server/ai/usage-buffer";
import { guardedFetch } from "@starlens/server/server/security/url-guard";
import { type ChatRuntimeConfig, type OpenAiCompatibleResponse } from "./types";

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

// ─── Agent 工具调用 ────────────────────────────────────────────────────────────

export type AgentToolCallPayload = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AgentToolCallPayload[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AgentTurnResult = {
  content: string | null;
  tool_calls?: AgentToolCallPayload[];
};

// 中文注释：跟其余函数一样走 guardedFetch（SSRF 校验 + 安全跳转），单次请求超时 12 秒
// （比 intent 识别的 5 秒宽松一些，因为工具调用响应通常更重）；非 2xx 或异常直接返回 null，
// 不重试——重试逻辑交给上层的 Agent 循环决定。
export async function callChatCompletionsWithTools(opts: {
  messages: AgentChatMessage[];
  tools: readonly unknown[];
  config: ChatRuntimeConfig;
  userId?: string;
  maxTokens?: number;
}): Promise<AgentTurnResult | null> {
  try {
    const response = await guardedFetch(resolveChatCompletionsUrl(opts.config.baseUrl), {
      method: "POST",
      headers: { ...opts.config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${opts.config.apiKey}` },
      body: JSON.stringify({
        model: opts.config.model,
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 800,
        messages: opts.messages,
        tools: opts.tools,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      // 记录非 2xx 响应，方便排查 provider 鉴权失败 / 配额超限 / 模型不可用等问题。
      // 只读前 500 字符避免日志爆炸，不打印 apiKey。
      const body = await response.text().catch(() => "");
      console.warn(
        `[ai/ask] provider returned non-2xx: status=${response.status} model=${opts.config.model} baseUrl=${opts.config.baseUrl} body=${body.slice(0, 500)}`,
      );
      return null;
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse & {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: AgentToolCallPayload[] } }>;
    };
    if (opts.userId) {
      trackAiUsage({ userId: opts.userId, endpoint: "ask/agent", model: opts.config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
    }

    const message = payload.choices?.[0]?.message;
    if (!message) return null;

    return { content: message.content ?? null, tool_calls: message.tool_calls };
  } catch (error) {
    // 网络错误 / 超时 / JSON 解析失败等——记录原因，不打印 apiKey
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/ask] provider request failed: model=${opts.config.model} baseUrl=${opts.config.baseUrl} error=${msg}`);
    return null;
  }
}


