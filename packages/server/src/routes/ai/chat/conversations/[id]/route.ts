// 单个对话路由
// GET：获取会话及其消息列表（用于加载历史）
// DELETE：删除会话（级联删除消息）
// PATCH：更新标题

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import {
  deleteConversation,
  listMessages,
  updateConversationTitle,
} from "@starlens/server/server/chat/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const { messages, conversation } = await listMessages(user.id, id, { limit: 200 });

  if (!conversation) {
    return fail("conversation_not_found", "Conversation was not found.", 404);
  }

  return ok({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      lastQuestion: conversation.lastQuestion,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      candidates: m.candidates,
      createdAt: m.createdAt,
    })),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const deleted = await deleteConversation(user.id, id);

  if (!deleted) {
    return fail("conversation_not_found", "Conversation was not found.", 404);
  }

  return ok({ deleted: true });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.title !== "string" || !body.title.trim()) {
    return fail("invalid_title", "Title is required.");
  }

  const updated = await updateConversationTitle(user.id, id, body.title.trim());

  if (!updated) {
    return fail("conversation_not_found", "Conversation was not found.", 404);
  }

  return ok({ updated: true });
}
