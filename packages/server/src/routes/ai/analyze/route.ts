// AI 仓库分析路由入口
// 职责：鉴权、参数校验、运行时配置装配、限流、调用 analyzeRepo 业务逻辑
// 输出结构：data / meta.rateLimit / suggestedNextActions / reasoningHints（spec 第 7 节）

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { resolveAiRuntimeConfig } from "@starlens/server/server/ai/configs";
import { checkRateLimit, getRateLimitStatus } from "@starlens/server/server/ai/rate-limit";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { asChatRuntimeConfig } from "@starlens/server/server/ai/ask/provider";
import { analyzeRepo } from "@starlens/server/server/ai/analyze";

const MAX_REPO_INPUT_LENGTH = 200;

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

  const applySuggestions = typeof body.applySuggestions === "boolean" ? body.applySuggestions : false;

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

  try {
    const result = await analyzeRepo(user.id, { repo, applySuggestions }, chatConfig);

    // 中文注释：透传限流状态到 meta.rateLimit，让 agent 知道何时收敛调用频率。
    const rateLimit = getRateLimitStatus(user.id, isSystemKey);

    return ok({
      ...result,
      meta: { ...result.meta, rateLimit },
    });
  } catch (error) {
    // analyzeRepo 中的 GitHub API 调用或 AI 调用失败——返回明确错误，
    // 不静默吞掉。日志只记录 error name/message 和 userId，不打印 token。
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[routes/ai/analyze] analyzeRepo failed: userId=${user.id} repo=${repo} error=${msg}`);

    // GitHub 404 或 token 未连接等情况——区分明确的 4xx 错误和 5xx 错误
    if (error instanceof Error && error.message.includes("was not found")) {
      return fail("repo_not_found", error.message, 404);
    }
    if (error instanceof Error && error.message.includes("GitHub account is not connected")) {
      return fail("github_not_connected", error.message, 422);
    }
    return fail("analyze_failed", msg, 500);
  }
}
