// unstar_repo 路由入口 —— 真实调用 GitHub unstar API（区别于 [id] 路由 PATCH isFavorite 那种本地标记）

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { GithubStarError, unstarRepoOnGithubForUser } from "@starlens/server/server/repos/github-star";

const ERROR_STATUS: Record<GithubStarError["code"], number> = {
  not_found: 404,
  invalid_input: 400,
  forbidden_scope: 403,
  upstream_error: 502,
};

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  if (typeof body.repo !== "string" || !body.repo.trim()) {
    return fail("invalid_repo", "Repository (owner/repo or id) is required.");
  }

  try {
    const repo = await unstarRepoOnGithubForUser(user.id, body.repo.trim());
    if (!repo) return fail("repo_not_found", "Repository was not found.", 404);
    return ok(repo);
  } catch (error) {
    if (error instanceof GithubStarError) {
      return fail(error.code, error.message, ERROR_STATUS[error.code]);
    }
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[routes/repos/unstar] unstarRepoOnGithubForUser failed: userId=${user.id} error=${msg}`);
    if (error instanceof Error && error.message.includes("GitHub account is not connected")) {
      return fail("github_not_connected", error.message, 422);
    }
    return fail("unstar_failed", msg, 500);
  }
}
