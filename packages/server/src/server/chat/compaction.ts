// 历史消息压缩策略（滑动窗口 + 自动摘要，对齐 Claude Code compaction 模式）
// 职责：在每次提问前检查会话消息数，超出阈值时把最早的一部分压缩成摘要，
// 保留最近 CHAT_RECENT_WINDOW 条原文。摘要失败时降级为丢弃溢出消息（退化为纯滑动窗口）。

import "server-only";

import { callChatCompletionsText } from "../ai/ask/provider";
import type { ChatRuntimeConfig } from "../ai/ask/types";
import { CHAT_COMPACT_THRESHOLD, CHAT_RECENT_WINDOW, CHAT_SUMMARY_MAX_TOKENS } from "../ai/ask/agent/loop";
import {
  getConversation,
  listMessagesAfter,
  updateConversationSummary,
} from "./repository";

// 中文注释：listMessagesAfter 返回的 DB 行类型
type ChatMessageRow = Awaited<ReturnType<typeof listMessagesAfter>>[number];

export type CompactionResult = {
  // 当前摘要（可能为 null，表示无摘要或摘要生成失败）
  summary: string | null;
  // 传给 agent loop 的最近消息原文（最多 CHAT_RECENT_WINDOW 条）
  recentMessages: ChatMessageRow[];
};

// 中文注释：检查并执行 compaction。在 SSE 路由每次提问前调用。
// 1. 加载会话 summary + summarizedUpTo + summarizedUpTo 之后的消息
// 2. 若消息数 > CHAT_COMPACT_THRESHOLD，取溢出部分调 LLM 生成摘要
// 3. 更新 conversations.summary + summarizedUpTo
// 4. 返回摘要 + 最近 CHAT_RECENT_WINDOW 条消息
// 摘要失败时降级：仍返回最近窗口的消息，但 summary 保持旧值（或 null）
export async function compactConversationIfNeeded(
  conversationId: string,
  userId: string,
  config: ChatRuntimeConfig,
): Promise<CompactionResult> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) {
    return { summary: null, recentMessages: [] };
  }

  const existingSummary = conversation.summary ?? null;
  const summarizedUpTo = conversation.summarizedUpTo ?? null;

  // 取 summarizedUpTo 之后的所有消息
  const messagesAfter = await listMessagesAfter(userId, conversationId, summarizedUpTo);
  const recentCount = messagesAfter.length;

  // 未超过阈值，无需 compaction
  if (recentCount <= CHAT_COMPACT_THRESHOLD) {
    // 取最近 CHAT_RECENT_WINDOW 条作为 priorContext
    const recentMessages = messagesAfter.slice(-CHAT_RECENT_WINDOW);
    return { summary: existingSummary, recentMessages };
  }

  // 中文注释：超过阈值，需要 compaction。
  // 溢出部分 = recentCount - CHAT_RECENT_WINDOW 条（最早的那批）
  // 保留部分 = 最后 CHAT_RECENT_WINDOW 条（最近的）
  const overflowCount = recentCount - CHAT_RECENT_WINDOW;
  const overflowMessages = messagesAfter.slice(0, overflowCount);
  const recentMessages = messagesAfter.slice(-CHAT_RECENT_WINDOW);

  // 生成摘要：把旧 summary（若有）+ 溢出消息喂给 LLM
  const newSummary = await generateSummary(existingSummary, overflowMessages, config, userId);

  if (newSummary) {
    // 摘要成功：更新 conversations.summary + summarizedUpTo（指向溢出部分最后一条消息 id）
    const lastOverflowMessageId = overflowMessages[overflowMessages.length - 1]?.id;
    if (lastOverflowMessageId) {
      await updateConversationSummary(userId, conversationId, newSummary, lastOverflowMessageId);
    }
    return { summary: newSummary, recentMessages };
  }

  // 中文注释：摘要失败降级——丢弃溢出消息（退化为纯滑动窗口），summary 保持旧值。
  // 不阻塞主流程，用户仍能继续对话，只是丢失了早期上下文的摘要。
  console.warn(`[ai/chat] compaction summary generation failed, degrading to sliding window only. conversationId=${conversationId}`);
  return { summary: existingSummary, recentMessages };
}

// 中文注释：调用 LLM 生成结构化中文摘要。
// 输入：旧摘要（若有）+ 溢出消息（user/assistant 对）
// 输出：包含用户问题、推荐仓库（id/fullName/理由）、关键决策的结构化摘要
async function generateSummary(
  existingSummary: string | null,
  overflowMessages: ChatMessageRow[],
  config: ChatRuntimeConfig,
  userId: string,
): Promise<string | null> {
  if (overflowMessages.length === 0) return existingSummary;

  // 中文注释：把溢出消息格式化成可读文本，供 LLM 理解对话内容
  const conversationText = overflowMessages
    .map((m) => {
      const role = m.role === "user" ? "用户" : "助手";
      const candidates = m.role === "assistant" && Array.isArray(m.candidates) && m.candidates.length > 0
        ? `\n  推荐仓库：${m.candidates.map((c: { id: string; fullName: string; reason: string }) => `${c.fullName}(id:${c.id})`).join(", ")}`
        : "";
      return `${role}：${m.content}${candidates}`;
    })
    .join("\n\n");

  const systemPrompt = `你是一个对话摘要助手。请把以下对话内容压缩成一份简洁的中文摘要，用于让 AI 在后续对话中引用早期上下文。

要求：
1. 保留用户问过的每个问题的核心意图（简述）
2. 保留 AI 推荐过的仓库（必须保留 id 和 fullName，这是跨轮引用的关键）
3. 保留任何关键决策或用户偏好
4. 总长度控制在 400 字以内
5. 用结构化的要点格式输出，不要寒暄

格式示例：
- 用户问题1：xxx
  AI 回答要点：xxx
  推荐仓库：owner/repo (id:xxx), owner/repo2 (id:xxx)
- 用户问题2：xxx
  ...`;

  const userPrompt = `${existingSummary ? `之前的摘要：\n${existingSummary}\n\n` : ""}需要压缩的对话内容：\n${conversationText}`;

  const result = await callChatCompletionsText({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config,
    userId,
    maxTokens: CHAT_SUMMARY_MAX_TOKENS,
  });

  return result?.trim() || null;
}
