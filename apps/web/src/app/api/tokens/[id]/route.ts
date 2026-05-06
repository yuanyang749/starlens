import { ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";
import { revokePersonalApiToken } from "@/server/auth/personal-tokens";

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
