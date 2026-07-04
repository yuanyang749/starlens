// 仓库整理建议路由入口
// 职责：鉴权、参数校验、调用 suggestOrganization 业务逻辑
// 输出结构：data / meta.empty / suggestedNextActions / reasoningHints（spec 第 7 节）
// 注意：纯 DB 聚合，无 AI 调用——不需要 resolveAiRuntimeConfig/checkRateLimit。

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { suggestOrganization, type OrganizationFocus } from "@starlens/server/server/repos/organization";

const VALID_FOCUSES = new Set<OrganizationFocus>(["duplicates", "stale", "untagged", "all"]);

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  // 从 query string 读取 focus 参数，默认 "all"。
  const url = new URL(request.url);
  const focusParam = url.searchParams.get("focus") ?? "all";

  if (!VALID_FOCUSES.has(focusParam as OrganizationFocus)) {
    return fail("invalid_focus", "focus must be one of: duplicates, stale, untagged, all.");
  }

  const focus = focusParam as OrganizationFocus;

  const result = await suggestOrganization(user.id, { focus });

  return ok(result);
}
