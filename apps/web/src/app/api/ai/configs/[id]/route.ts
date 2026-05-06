import { fail, ok, unauthorized } from "@/lib/api-response";
import { getApiUser } from "@/server/auth/api-user";
import { deleteAiConfig, updateAiConfig } from "@/server/ai/configs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const config = await updateAiConfig(user.id, id, body);

  if (!config) {
    return fail("ai_config_not_found", "AI config was not found.", 404);
  }

  return ok(config);
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  await deleteAiConfig(user.id, id);

  return ok({ deleted: true });
}
