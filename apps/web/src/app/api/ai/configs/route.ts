import { fail, ok, unauthorized } from "@/lib/api-response";
import { getApiUser } from "@/server/auth/api-user";
import { createAiConfig, listAiConfigs } from "@/server/ai/configs";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  return ok(await listAiConfigs(user.id));
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (
    typeof body.displayName !== "string" ||
    typeof body.providerType !== "string" ||
    typeof body.model !== "string"
  ) {
    return fail("invalid_ai_config", "Display name, provider type, and model are required.");
  }

  return ok(await createAiConfig(user.id, body));
}
