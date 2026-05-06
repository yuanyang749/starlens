import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";
import {
  createPersonalApiToken,
  listPersonalApiTokens,
} from "@/server/auth/personal-tokens";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  return ok(await listPersonalApiTokens(user.id));
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.name !== "string" || !body.name.trim()) {
    return fail("invalid_token_name", "Token name is required.");
  }

  return ok(await createPersonalApiToken(user.id, body.name.trim()));
}
