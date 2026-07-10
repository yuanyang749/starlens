// AI 对话 SSE 流式路由
// 职责：鉴权、参数校验、运行时配置装配、限流、会话管理、compaction、流式 Agent 检索
// 与 /api/ai/ask 的区别：多轮上下文（priorContext）+ SSE 流式输出 + DB 持久化

// 中文注释：SSE 流式路由必须禁用静态优化，否则 Next.js 构建时会把它当静态页面处理，
// 导致流式响应被缓冲成一次性返回。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { fail, unauthorized } from "@starlens/server/lib/api-response";
import { resolveAiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { checkRateLimit } from "@starlens/server/server/ai/rate-limit";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { asChatRuntimeConfig } from "@starlens/server/server/ai/ask/provider";
import type { AgentChatMessage } from "@starlens/server/server/ai/ask/provider";
import { runAgentLoop, type ChatStreamEvent } from "@starlens/server/server/ai/ask/agent/loop";
import { MAX_QUESTION_LENGTH } from "@starlens/server/server/ai/ask/types";
import { compactConversationIfNeeded } from "@starlens/server/server/chat/compaction";
import {
  appendMessage,
  createConversation,
  getConversation,
  updateConversationLastQuestion,
  type ChatCandidate,
} from "@starlens/server/server/chat/repository";

// 中文注释：传给模型前对 assistant 历史消息做轻量清洗，减少 token 消耗。
// 只做两项最保守的清洗：折叠多余空行 + 移除 markdown 标题符号。
// 保留粗体/代码块/列表等带语义的格式；user 消息不清洗避免破坏语义。
function sanitizeAssistantForContext(content: string): string {
  return content
    .replace(/\n{3,}/g, "\n\n")   // 3+ 连续空行折叠为 2
    .replace(/^#{1,6}\s+/gm, "")   // 移除行首标题符号（# ~ ######）
    .trim();
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.question !== "string" || !body.question.trim()) {
    return fail("invalid_question", "Question is required.");
  }

  const question = body.question.trim();
  if (question.length > MAX_QUESTION_LENGTH) {
    return fail("question_too_long", `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.`);
  }

  const conversationId: string | undefined =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : undefined;

  const runtimeResolution = await resolveAiRuntimeConfig(user.id, "chat_completions");
  const chatConfig = asChatRuntimeConfig(runtimeResolution.config);

  const isSystemKey = runtimeResolution.source === "system_default";
  const rateCheck = checkRateLimit(user.id, isSystemKey);
  if (!rateCheck.allowed) {
    return fail("rate_limit_exceeded", `Too many requests. Retry in ${rateCheck.retryAfterSeconds}s.`, 429);
  }

  if (!chatConfig) {
    return fail("no_ai_provider", "No AI provider is configured. Set one up in AI Provider settings first.", 422);
  }

  // 中文注释：会话管理——有 conversationId 则校验归属，无则新建
  let activeConversationId = conversationId;
  if (activeConversationId) {
    const owned = await getConversation(user.id, activeConversationId);
    if (!owned) {
      return fail("conversation_not_found", "Conversation was not found.", 404);
    }
  } else {
    // 新建会话，标题取问题前 30 字符
    const title = question.slice(0, 30);
    const conv = await createConversation(user.id, title);
    activeConversationId = conv.id;
  }

  // 中文注释：compaction——检查是否需要压缩历史，返回摘要 + 最近窗口消息
  const compaction = await compactConversationIfNeeded(activeConversationId, user.id, chatConfig);

  // 中文注释：组装 priorContext——摘要作为 system 消息 + 最近消息原文（不含 tool_calls）
  // 对 assistant 消息做轻量清洗（折叠空行 + 移除标题符号），减少 token 消耗；
  // user 消息保持原文避免破坏语义。DB 仍存原文，清洗只作用于传给模型的副本。
  const priorContext: AgentChatMessage[] = [];
  if (compaction.summary) {
    priorContext.push({ role: "system", content: `之前的对话摘要：\n${compaction.summary}` });
  }
  for (const msg of compaction.recentMessages) {
    const role = msg.role as "user" | "assistant";
    priorContext.push({ role, content: role === "assistant" ? sanitizeAssistantForContext(msg.content) : msg.content });
  }
  const hasSummary = Boolean(compaction.summary);

  // 先写入 user 消息到 DB
  await appendMessage(user.id, activeConversationId, "user", question);

  // 中文注释：SSE 流式响应。用 ReadableStream + controller 写入事件。
  // onStream 回调把 agent loop 的事件实时写入 SSE 流，实现逐字输出。
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        // 中文注释：AI 提供商不流式返回 tool_calls.arguments，token 事件无实际流式效果。
        // 改为一次性输出——done 事件带完整 answer，前端用打字机效果模拟逐字显示。
        if (event.type === "token") return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const result = await runAgentLoop(question, user.id, chatConfig, {
          priorContext,
          hasSummary,
          onStream: send,
        });

        if (result) {
          // 写入 assistant 消息到 DB（candidates 转成 ChatCandidate 格式）
          const candidates: ChatCandidate[] = result.candidates.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            reason: c.reason,
            source: c.source,
            score: c.score,
          }));
          await appendMessage(user.id, activeConversationId, "assistant", result.answer, candidates);
          await updateConversationLastQuestion(user.id, activeConversationId, question);
        } else {
          // 中文注释：agent loop 返回 null（检索失败），记录一条失败消息便于历史展示
          await appendMessage(
            user.id,
            activeConversationId,
            "assistant",
            "抱歉，未能生成回答，请换个问法重试。",
          );
        }
      } catch (error) {
        // 兜底：agent loop 异常，发送 error 事件
        const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[ai/chat] agent loop crashed: userId=${user.id} conversationId=${activeConversationId} error=${msg}`);
        send({ type: "error", message: "AI 服务异常，请稍后重试。" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // 中文注释：禁用 nginx/反代缓冲，确保 SSE 事件实时到达前端
      "X-Accel-Buffering": "no",
      // 中文注释：返回新建会话 id，前端首次提问后需要用它加载历史
      "X-Conversation-Id": activeConversationId,
    },
  });
}
