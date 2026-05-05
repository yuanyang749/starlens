import { patchMockAiConfig } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const config = patchMockAiConfig(id, body);

  if (!config) {
    return fail("ai_config_not_found", "AI config was not found.", 404);
  }

  return ok(config);
}

export async function DELETE(_request: Request, context: RouteContext) {
  await context.params;

  return ok({ deleted: true });
}
