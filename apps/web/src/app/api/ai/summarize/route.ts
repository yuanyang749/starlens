import { getMockRepo } from "@starlens/core";
import { fail, ok, unauthorized } from "@/lib/api-response";
import { getApiUser } from "@/server/auth/api-user";

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.repoId !== "string") {
    return fail("invalid_repo_id", "Repo id is required.");
  }

  const repo = getMockRepo(body.repoId);
  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok({
    repoId: repo.id,
    summary:
      repo.aiSummary ??
      `${repo.fullName} is a ${repo.language} repository focused on ${repo.topics.join(
        ", ",
      )}.`,
  });
}
