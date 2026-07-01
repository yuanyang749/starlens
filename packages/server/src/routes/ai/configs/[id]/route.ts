import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { deleteAiConfig, updateAiConfig } from "@starlens/server/server/ai/configs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const config = await updateAiConfig(user.id, id, body);

    if (!config) {
      return fail("ai_config_not_found", "AI config was not found.", 404);
    }

    return ok(config);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to update AI config.";
    return fail("invalid_ai_config", message);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const { id } = await context.params;
  await deleteAiConfig(user.id, id);

  return ok({ deleted: true });
}
