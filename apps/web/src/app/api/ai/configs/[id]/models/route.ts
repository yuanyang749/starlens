import { fail, ok, unauthorized } from "@/lib/api-response";
import { getApiUser } from "@/server/auth/api-user";
import { getAiConfigModels } from "@/server/ai/configs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const result = await getAiConfigModels(user.id, id);

  if (!result) {
    return fail("ai_config_not_found", "AI config was not found.", 404);
  }

  return ok(result);
}
