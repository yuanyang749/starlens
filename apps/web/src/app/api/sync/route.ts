import { ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";
import { syncGitHubStars } from "@/server/github/sync";

export async function POST() {
  const user = await getSessionUser();

  if (!user) {
    return unauthorized();
  }

  const startedAt = new Date().toISOString();
  const counts = await syncGitHubStars(user.id);

  return ok({
    status: "completed",
    startedAt,
    finishedAt: new Date().toISOString(),
    counts,
  });
}
