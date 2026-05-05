import { getMockAiConfig } from "@starlens/core";
import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const modelsByProvider = {
  vercel_gateway: ["openai/gpt-5.4", "anthropic/claude-sonnet-4.5"],
  openai_compatible: ["deepseek-chat", "moonshot-v1-32k", "abab6.5s-chat"],
  anthropic_native: ["claude-sonnet-4.5", "claude-haiku-4.5"],
  gemini_native: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await context.params;
  const config = getMockAiConfig(id);

  if (!config) {
    return fail("ai_config_not_found", "AI config was not found.", 404);
  }

  return ok({
    providerType: config.providerType,
    models: modelsByProvider[config.providerType],
  });
}
