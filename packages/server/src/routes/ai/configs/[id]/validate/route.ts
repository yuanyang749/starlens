import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { validateAiConfig } from "@starlens/server/server/ai/configs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const result = await validateAiConfig(user.id, id);

  if (!result) {
    return fail("ai_config_not_found", "AI config was not found.", 404);
  }

  return ok(result);
}
