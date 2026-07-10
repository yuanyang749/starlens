"use client";

// AI 对话流式 Hook
// 职责：通过 SSE 接收 /api/ai/chat 的流式响应，管理消息状态与流式过程
// 不依赖 @ai-sdk/react，直接用 fetch + ReadableStream 解析自定义 SSE 协议

import { useCallback, useRef, useState } from "react";

// 候选仓库（与 /api/ai/ask 的 candidates 同构）
export type ChatCandidate = {
  id: string;
  fullName: string;
  reason: string;
  source?: string;
  score?: number;
};

// 对话消息
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  candidates?: ChatCandidate[];
  // 流式过程中的状态提示（"正在搜索仓库…" 等），token 开始后清空
  statusText?: string;
  isStreaming?: boolean;
  // 中文注释：消息创建时间（ISO 字符串），用于 hover 显示时间戳
  createdAt?: string;
  // 中文注释：工具调用记录，用于可视化展示
  toolCalls?: { name: string; args: string }[];
  // 中文注释：本轮对话 token 用量（部分端点可能不返回）
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// SSE 事件类型（与后端 ChatStreamEvent 对齐）
type StreamEvent =
  | { type: "status"; status: string; message: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string; arguments: string }
  | { type: "done"; answer: string; candidates: ChatCandidate[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  | { type: "error"; message: string };

// 状态事件兜底文案
const STATUS_FALLBACK: Record<string, string> = {
  thinking: "正在思考…",
  searching: "正在搜索仓库…",
  looking_up: "正在查看仓库详情…",
  stats: "正在统计仓库数据…",
  generating: "正在生成回答…",
};

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #15 连接中断标记（区分用户主动停止和网络错误）
  const [connectionError, setConnectionError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 中文注释：记录最后一次发送的文本，用于断线重连
  const lastSentTextRef = useRef<string | null>(null);

  // 中文注释：打字机相关 ref。
  // AI 提供商不流式返回 tool_calls.arguments，整个 answer 一次性到达。
  // done 事件后启动打字机，逐字追加 content，模拟流式效果。
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typewriterActiveRef = useRef(false);

  // 启动打字机：逐字追加 answer 到指定消息
  const startTypewriter = useCallback(
    (msgId: string, fullText: string, candidates?: ChatCandidate[], usage?: { prompt_tokens?: number; completion_tokens?: number }) => {
      // 停止之前的打字机
      if (typewriterRef.current) clearInterval(typewriterRef.current);
      typewriterActiveRef.current = true;

      // 根据文本长度动态调整速度，长回答不至于等太久
      const charsPerTick = fullText.length > 1500 ? 8 : fullText.length > 500 ? 4 : 2;
      const intervalMs = 16; // 约 60fps
      let pos = 0;

      // 先清空 statusText，content 保持空，打字机会逐步填充
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, statusText: undefined } : m)),
      );

      typewriterRef.current = setInterval(() => {
        pos += charsPerTick;
        if (pos >= fullText.length) {
          // 打字完成
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: fullText, candidates, isStreaming: false, usage }
                : m,
            ),
          );
          if (typewriterRef.current) {
            clearInterval(typewriterRef.current);
            typewriterRef.current = null;
          }
          typewriterActiveRef.current = false;
          setIsStreaming(false);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, content: fullText.slice(0, pos) } : m)),
          );
        }
      }, intervalMs);
    },
    [],
  );

  // 发送消息并接收流式响应
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setConnectionError(false);
      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      // 乐观添加 user 消息 + assistant 占位消息
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: trimmed, createdAt: now },
        { id: assistantMsgId, role: "assistant", content: "", statusText: "正在思考…", isStreaming: true, createdAt: now, toolCalls: [] },
      ]);
      setIsStreaming(true);

      // 中文注释：记录本次发送的文本，用于断线重连
      lastSentTextRef.current = trimmed;

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            conversationId: conversationId ?? undefined,
          }),
          signal: abortController.signal,
        });

        // 非 SSE 错误响应（JSON 包体）
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message ?? `请求失败 (${response.status})`);
        }

        // 从响应头取会话 id（首次提问后端新建会话）
        const headerConvId = response.headers.get("X-Conversation-Id");
        if (headerConvId) setConversationId(headerConvId);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // 中文注释：SSE 事件以空行分隔，逐块解析 data: {...}
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const line = block.trim();
            if (!line.startsWith("data: ")) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(6)) as StreamEvent;
            } catch {
              continue;
            }
            // 根据事件类型更新 assistant 占位消息
            if (event.type === "done") {
              // done 事件：启动打字机，逐字显示完整 answer
              startTypewriter(assistantMsgId, event.answer, event.candidates, event.usage);
              continue;
            }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                switch (event.type) {
                  case "status":
                    return { ...m, statusText: event.message || STATUS_FALLBACK[event.status] || "处理中…" };
                  case "tool_call":
                    // 中文注释：收集工具调用记录用于可视化，同时更新状态提示
                    return {
                      ...m,
                      statusText: `调用 ${event.name}…`,
                      toolCalls: [...(m.toolCalls ?? []), { name: event.name, args: event.arguments }],
                    };
                  case "error":
                    return { ...m, content: event.message, statusText: undefined, isStreaming: false };
                  default:
                    return m;
                }
              }),
            );
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 用户主动停止，保留已生成内容
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false, statusText: undefined } : m)),
          );
        } else {
          // #15 网络错误/连接中断：标记 connectionError，保留占位消息，允许重试
          const msg = err instanceof Error ? err.message : "发送失败";
          setError(msg);
          setConnectionError(true);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content, isStreaming: false, statusText: undefined }
                : m,
            ),
          );
        }
      } finally {
        // 如果打字机正在运行，isStreaming 由打字机完成回调设置
        if (!typewriterActiveRef.current) {
          setIsStreaming(false);
        }
        abortRef.current = null;
      }
    },
    [conversationId, isStreaming, startTypewriter],
  );

  // 主动停止：中断 SSE 请求 + 停止打字机
  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    if (typewriterActiveRef.current) {
      typewriterActiveRef.current = false;
      setIsStreaming(false);
      // 停止时保留已打出的内容，标记为完成
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, statusText: undefined } : m)),
      );
    }
  }, []);

  // 加载历史消息（切换会话时调用）
  const loadHistory = useCallback((convId: string, msgs: ChatMessage[]) => {
    setConversationId(convId);
    setMessages(msgs);
    setError(null);
  }, []);

  // 重置（新建对话）
  const reset = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    typewriterActiveRef.current = false;
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  // 重新生成：删除最后一条 assistant 消息，用上一条 user 消息重新提问
  const regenerate = useCallback(async () => {
    if (isStreaming) return;
    // 找到最后一条 user 消息
    let lastUserText: string | null = null;
    setMessages((prev) => {
      // 从末尾找 user 消息
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "user") {
          lastUserText = prev[i].content;
          break;
        }
      }
      // 删除最后一条 assistant 消息
      const idx = prev.length - 1;
      if (prev[idx]?.role === "assistant") {
        return prev.slice(0, idx);
      }
      return prev;
    });
    if (lastUserText) {
      await sendMessage(lastUserText);
    }
  }, [isStreaming, sendMessage]);

  // #15 断线重连：删除失败的 assistant 占位消息，用上次发送的文本重试
  const retry = useCallback(async () => {
    if (isStreaming || !lastSentTextRef.current) return;
    // 删除最后一条 assistant 消息（失败的占位）
    setMessages((prev) => {
      const idx = prev.length - 1;
      if (prev[idx]?.role === "assistant") {
        return prev.slice(0, idx);
      }
      return prev;
    });
    setConnectionError(false);
    setError(null);
    await sendMessage(lastSentTextRef.current);
  }, [isStreaming, sendMessage]);

  return { messages, isStreaming, conversationId, error, connectionError, sendMessage, stop, loadHistory, reset, regenerate, retry };
}
