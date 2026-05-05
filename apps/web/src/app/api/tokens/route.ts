import { createMockToken, listMockTokens } from "@starlens/core";
import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  return ok(listMockTokens());
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.name !== "string" || !body.name.trim()) {
    return fail("invalid_token_name", "Token name is required.");
  }

  return ok(createMockToken(body.name.trim()));
}
