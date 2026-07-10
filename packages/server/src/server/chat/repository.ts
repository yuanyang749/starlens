// AI 对话持久化仓库层
// 职责：conversations + chat_messages 的 CRUD，所有操作均带 userId 归属校验

import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { chatMessages, conversations } from "../../db/schema";

// ─── 候选仓库类型（与 /api/ai/ask 的 candidates 同构） ────────────────────────

export type ChatCandidate = {
  id: string;
  fullName: string;
  reason: string;
  source?: string;
  score?: number;
};

// ─── 会话列表项（精简，用于侧边栏） ───────────────────────────────────────────

export type ConversationSummary = {
  id: string;
  title: string;
  lastQuestion: string | null;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── 会话 CRUD ────────────────────────────────────────────────────────────────

export async function listConversations(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ConversationSummary[]> {
  const db = getDb();
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      lastQuestion: conversations.lastQuestion,
      summary: conversations.summary,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);
  return rows;
}

export async function getConversation(
  userId: string,
  conversationId: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createConversation(
  userId: string,
  title: string,
  lastQuestion?: string,
) {
  const db = getDb();
  const [row] = await db
    .insert(conversations)
    .values({ userId, title, lastQuestion: lastQuestion ?? null })
    .returning();
  return row;
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const db = getDb();
  // 中文注释：先校验归属，再级联删除（chat_messages 通过 onDelete: cascade 自动清理）
  const owned = await getConversation(userId, conversationId);
  if (!owned) return false;
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  return true;
}

export async function updateConversationTitle(
  userId: string,
  conversationId: string,
  title: string,
): Promise<boolean> {
  const db = getDb();
  const owned = await getConversation(userId, conversationId);
  if (!owned) return false;
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  return true;
}

export async function updateConversationLastQuestion(
  userId: string,
  conversationId: string,
  lastQuestion: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ lastQuestion, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

// compaction 用：更新摘要 + 已覆盖消息 id
export async function updateConversationSummary(
  userId: string,
  conversationId: string,
  summary: string,
  summarizedUpTo: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ summary, summarizedUpTo, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

// ─── 消息 CRUD ────────────────────────────────────────────────────────────────

export async function listMessages(
  userId: string,
  conversationId: string,
  opts: { limit?: number } = {},
) {
  const db = getDb();
  // 中文注释：先校验会话归属，避免越权读取他人消息
  const owned = await getConversation(userId, conversationId);
  if (!owned) return { messages: [], conversation: null };
  const limit = opts.limit ?? 100;
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .limit(limit);
  return { messages: rows, conversation: owned };
}

export async function appendMessage(
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  candidates: ChatCandidate[] = [],
) {
  const db = getDb();
  const [row] = await db
    .insert(chatMessages)
    .values({ conversationId, userId, role, content, candidates })
    .returning();
  return row;
}

// 中文注释：删除会话最后一条 assistant 消息（regenerate 场景：重新生成前先删旧回答）
export async function deleteLastAssistantMessage(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const db = getDb();
  const owned = await getConversation(userId, conversationId);
  if (!owned) return false;
  // 取该会话最后一条 assistant 消息
  const rows = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.role, "assistant")))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(1);
  if (rows.length === 0) return false;
  await db.delete(chatMessages).where(eq(chatMessages.id, rows[0].id));
  return true;
}

// compaction 用：取 summarizedUpTo 之后的全部消息（用于判断窗口 + 取溢出部分）
export async function listMessagesAfter(
  userId: string,
  conversationId: string,
  afterMessageId: string | null,
) {
  const db = getDb();
  const owned = await getConversation(userId, conversationId);
  if (!owned) return [];
  // 中文注释：afterMessageId 为 null 时取全部；否则取该 id 之后的消息。
  // 用 createdAt + id 排序保证稳定顺序，再用程序过滤 afterMessageId 之前的。
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  if (!afterMessageId) return rows;
  const idx = rows.findIndex((m) => m.id === afterMessageId);
  if (idx === -1) return rows;
  return rows.slice(idx + 1);
}
