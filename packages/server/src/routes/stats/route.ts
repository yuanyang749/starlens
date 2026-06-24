import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import { getRepoStats } from "@starlens/server/server/repos/repository";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const stats = await getRepoStats(user.id);
  return ok(stats);
}
