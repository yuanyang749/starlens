import { ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  await context.params;

  return ok({ revoked: true });
}
