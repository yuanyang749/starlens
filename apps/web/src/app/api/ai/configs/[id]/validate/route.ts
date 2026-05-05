import { getMockAiConfig } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const config = getMockAiConfig(id);

  if (!config) {
    return fail("ai_config_not_found", "AI config was not found.", 404);
  }

  return ok({
    status: config.lastValidationStatus,
    validatedAt: new Date().toISOString(),
    message:
      config.lastValidationError ??
      "Mock validation completed. Real provider checks come in the next data milestone.",
  });
}
