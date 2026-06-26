// AI 问答路由入口 — 瘦身后的 HTTP 层
// 职责：鉴权、参数校验、运行时配置装配、限流、意图识别、分支分发

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { resolveAiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { checkRateLimit } from "@starlens/server/server/ai/rate-limit";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { asChatRuntimeConfig } from "@starlens/server/server/ai/ask/provider";
import { detectQueryIntent } from "@starlens/server/server/ai/ask/intent";
import { handleAskBranch } from "@starlens/server/server/ai/ask/answer";
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

  // ─── 意图识别：AI 结构化提取，无 AI 时正则兜底 ────────────────────────────────
  const intent = await detectQueryIntent(question, chatConfig);

  // ─── 分支分发与回答拼装 ───────────────────────────────────────────────────────
  const result = await handleAskBranch(intent, question, user.id, chatConfig);

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
