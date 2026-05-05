import { createMockToken, listMockTokens } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

export function GET() {
  return ok(listMockTokens());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (typeof body.name !== "string" || !body.name.trim()) {
    return fail("invalid_token_name", "Token name is required.");
  }

  return ok(createMockToken(body.name.trim()));
}
