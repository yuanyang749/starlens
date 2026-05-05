import { listMockAiConfigs } from "@starlens/core";
import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  return ok(listMockAiConfigs());
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (
    typeof body.displayName !== "string" ||
    typeof body.providerType !== "string" ||
    typeof body.model !== "string"
  ) {
    return fail("invalid_ai_config", "Display name, provider type, and model are required.");
  }

  return ok({
    id: "ai-new",
    displayName: body.displayName,
    providerType: body.providerType,
    model: body.model,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : null,
    enabled: Boolean(body.enabled),
    isDefault: Boolean(body.isDefault),
    lastValidatedAt: new Date().toISOString(),
    lastValidationStatus: "success",
    lastValidationError: null,
  });
}
