import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { addRepoTag, resolveRepoRowId } from "@starlens/server/server/repos/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getApiUser(request);

  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.tag !== "string" || !body.tag.trim()) {
    return fail("invalid_tag", "Tag is required.");
  }

  const resolvedId = await resolveRepoRowId(user.id, id);
  if (!resolvedId) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  const repo = await addRepoTag(user.id, resolvedId, body.tag);
  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok({ tags: repo.tags });
}
