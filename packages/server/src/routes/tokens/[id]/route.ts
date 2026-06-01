import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import { revokePersonalApiToken } from "@starlens/server/server/auth/personal-tokens";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await context.params;
  await revokePersonalApiToken(user.id, id);

  return ok({ revoked: true });
}
