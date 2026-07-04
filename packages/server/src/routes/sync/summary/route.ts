// 同步摘要路由入口
// 职责：鉴权、参数校验、调用 getSyncSummary 业务逻辑
// 输出结构：data / meta.empty / suggestedNextActions / reasoningHints（spec 第 7 节）
// 注意：纯 DB 聚合，无 AI 调用——不需要 resolveAiRuntimeConfig/checkRateLimit。

import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { getSyncSummary } from "@starlens/server/server/github/sync-summary";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  // 从 query string 读取可选的 since 参数（ISO 8601 时间戳）。
  const url = new URL(request.url);
  const since = url.searchParams.get("since") ?? undefined;

  // since 参数校验：传了的话必须是合法 ISO 时间戳。非法值会在业务逻辑中降级处理，
  // 但这里提前返回 400 让 agent 知道参数错误——避免被静默降级掩盖问题。
  if (since) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json(
        { ok: false, error: { code: "invalid_since", message: "since must be a valid ISO 8601 timestamp." } },
        { status: 400 },
      );
    }
  }

  const result = await getSyncSummary(user.id, { since });

  return ok(result);
}
