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
  // 中文注释：本轮 provider 调用的 token 用量（部分端点可能不返回）
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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

    return { content: message.content ?? null, tool_calls: message.tool_calls, usage: payload.usage };
  } catch (error) {
    // 网络错误 / 超时 / JSON 解析失败等——记录原因，不打印 apiKey
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/ask] provider request failed: model=${opts.config.model} baseUrl=${opts.config.baseUrl} error=${msg}`);
    return null;
  }
}

// ─── 流式版本（AI 对话用） ────────────────────────────────────────────────────
// 中文注释：与 callChatCompletionsWithTools 同构，但请求带 stream: true，
// 逐 chunk 解析 SSE，通过回调实时转发 content/tool_call arguments 的 delta，
// 最终返回完整累积的 AgentTurnResult（agent loop 逻辑无需改动）。
// 仅用于 /api/ai/chat 流式端点；原 /api/ai/ask 保持非流式不变。

type StreamingToolCallAccumulator = {
  index: number;
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export async function callChatCompletionsWithToolsStream(opts: {
  messages: AgentChatMessage[];
  tools: readonly unknown[];
  config: ChatRuntimeConfig;
  userId?: string;
  maxTokens?: number;
  onContentDelta?: (delta: string) => void;
  onToolCallDelta?: (toolName: string, argumentsDelta: string) => void;
  signal?: AbortSignal;
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
        stream: true,
      }),
      signal: opts.signal ?? AbortSignal.timeout(20_000),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      console.warn(
        `[ai/chat] stream provider returned non-2xx or no body: status=${response.status} model=${opts.config.model} body=${body.slice(0, 500)}`,
      );
      return null;
    }

    // 中文注释：手动解析 SSE 文本流。OpenAI 兼容格式：每条事件以 `data: ` 前缀，
    // 结束标记为 `data: [DONE]`。逐行读取，遇到不完整行缓存到 buffer。
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let contentAccumulated = "";
    const toolCallMap = new Map<number, StreamingToolCallAccumulator>();
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue; // 跳过畸形 chunk
        }
        if (chunk.usage) usage = chunk.usage;
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) {
          contentAccumulated += delta.content;
          opts.onContentDelta?.(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallMap.get(tc.index);
            if (existing) {
              if (tc.function?.arguments) {
                existing.function.arguments += tc.function.arguments;
                opts.onToolCallDelta?.(existing.function.name, tc.function.arguments);
              }
            } else {
              const name = tc.function?.name ?? "";
              const args = tc.function?.arguments ?? "";
              toolCallMap.set(tc.index, {
                index: tc.index,
                id: tc.id ?? `call_${tc.index}`,
                type: "function",
                function: { name, arguments: args },
              });
              if (args) opts.onToolCallDelta?.(name, args);
            }
          }
        }
      }
    }

    if (opts.userId && (usage?.prompt_tokens || usage?.completion_tokens)) {
      trackAiUsage({
        userId: opts.userId,
        endpoint: "chat/agent",
        model: opts.config.model,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      });
    }

    const toolCalls = Array.from(toolCallMap.values()).map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));

    if (!contentAccumulated && toolCalls.length === 0) return null;
    return { content: contentAccumulated || null, tool_calls: toolCalls.length > 0 ? toolCalls : undefined, usage };
  } catch (error) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/chat] stream provider request failed: model=${opts.config.model} baseUrl=${opts.config.baseUrl} error=${msg}`);
    return null;
  }
}

// ─── 纯文本生成（compaction 摘要用，不带 tools） ──────────────────────────────

export async function callChatCompletionsText(opts: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  config: ChatRuntimeConfig;
  userId?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  try {
    const response = await guardedFetch(resolveChatCompletionsUrl(opts.config.baseUrl), {
      method: "POST",
      headers: { ...opts.config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${opts.config.apiKey}` },
      body: JSON.stringify({
        model: opts.config.model,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 400,
        messages: opts.messages,
      }),
      signal: opts.signal ?? AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const text = payload.choices?.[0]?.message?.content ?? null;
    if (opts.userId && payload.usage) {
      trackAiUsage({
        userId: opts.userId,
        endpoint: "chat/summary",
        model: opts.config.model,
        promptTokens: payload.usage.prompt_tokens ?? 0,
        completionTokens: payload.usage.completion_tokens ?? 0,
      });
    }
    return text;
  } catch (error) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/chat] summary request failed: model=${opts.config.model} error=${msg}`);
    return null;
  }
}


