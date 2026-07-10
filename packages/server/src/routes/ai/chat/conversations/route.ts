// 对话列表路由
// GET：列出当前用户的会话（按 updatedAt 降序）
// POST：新建空会话

import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { createConversation, listConversations } from "@starlens/server/server/chat/repository";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  // 中文注释：支持分页参数
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "30", 10), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  const conversations = await listConversations(user.id, { limit, offset });

  return ok({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      lastQuestion: c.lastQuestion,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "新对话";

  const conv = await createConversation(user.id, title);

  return ok({
    id: conv.id,
    title: conv.title,
    lastQuestion: conv.lastQuestion,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  });
}
