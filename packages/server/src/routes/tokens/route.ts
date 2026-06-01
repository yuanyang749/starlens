import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import {
  createPersonalApiToken,
  listPersonalApiTokens,
} from "@starlens/server/server/auth/personal-tokens";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  return ok(await listPersonalApiTokens(user.id));
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (typeof body.name !== "string" || !body.name.trim()) {
    return fail("invalid_token_name", "Token name is required.");
  }

  return ok(await createPersonalApiToken(user.id, body.name.trim(), note));
}
