// AI 关联仓库路由入口
// 职责：鉴权、参数校验、运行时配置装配、限流、调用 findRelated 业务逻辑
// 输出结构：data / meta.rateLimit / meta.empty / suggestedNextActions / reasoningHints（spec 第 7 节）

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { resolveAiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { checkRateLimit, getRateLimitStatus } from "@starlens/server/server/ai/rate-limit";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { asChatRuntimeConfig } from "@starlens/server/server/ai/ask/provider";
import { findRelated } from "@starlens/server/server/ai/related";

const MAX_REPO_INPUT_LENGTH = 200;
const MAX_LIMIT = 30;

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.repo !== "string" || !body.repo.trim()) {
    return fail("invalid_repo", "Repository (owner/repo or id) is required.");
  }

  const repo = body.repo.trim();
  if (repo.length > MAX_REPO_INPUT_LENGTH) {
    return fail("repo_too_long", `Repository must be ${MAX_REPO_INPUT_LENGTH} characters or fewer.`);
  }

  // limit 校验：可选，整数 >=1，默认 10
  let limit: number | undefined;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || !Number.isInteger(body.limit)) {
      return fail("invalid_limit", "limit must be an integer.");
    }
    if (body.limit < 1 || body.limit > MAX_LIMIT) {
      return fail("invalid_limit", `limit must be between 1 and ${MAX_LIMIT}.`);
    }
    limit = body.limit;
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

  const result = await findRelated(user.id, { repo, limit }, chatConfig);

  const rateLimit = getRateLimitStatus(user.id, isSystemKey);

  return ok({
    ...result,
    meta: { ...result.meta, rateLimit },
  });
}
