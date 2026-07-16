import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import { getRepoStats } from "@starlens/server/server/repos/repository";
import { isAttentionFilter } from "@starlens/server/server/repos/dashboard-stats";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const attention = new URL(request.url).searchParams.get("attention");
  const stats = await getRepoStats(user.id, {
    attentionFilter: isAttentionFilter(attention) ? attention : undefined,
  });
  return ok(stats);
}
