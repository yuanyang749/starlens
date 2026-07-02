// AI 问答路由入口
// 职责：鉴权、参数校验、运行时配置装配、限流、Agent 检索

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { resolveAiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { checkRateLimit } from "@starlens/server/server/ai/rate-limit";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { asChatRuntimeConfig } from "@starlens/server/server/ai/ask/provider";
import { answerWithAgent } from "@starlens/server/server/ai/ask/agent/index";
import { MAX_QUESTION_LENGTH } from "@starlens/server/server/ai/ask/types";

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

  // 中文注释：主人明确要求不做兜底——Agent 检索失败/判定不支持 tool-calling/超时都直接
  // 返回明确的失败态，让用户换个问法重试，而不是拼凑一个不确定的答案。
  const result = await answerWithAgent(question, user.id, chatConfig);
  if (!result) {
    return fail("ask_failed", "Could not find a confident answer. Try rephrasing your question.", 422);
  }

  return ok({
    answer: result.answer,
    candidates: result.candidates.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      reason: item.reason,
      source: item.source,
      score: item.score,
    })),
    providerConfigId: chatConfig?.id ?? null,
    providerConfigSource: runtimeResolution.source,
  });
}
