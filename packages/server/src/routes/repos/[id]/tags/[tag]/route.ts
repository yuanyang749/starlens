import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { deleteRepoTag } from "@starlens/server/server/repos/repository";

type RouteContext = {
  params: Promise<{ id: string; tag: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getApiUser(request);

  if (!user) {
    return unauthorized();
  }

  const { id, tag } = await context.params;
  const repo = await deleteRepoTag(user.id, id, decodeURIComponent(tag));

  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok({ tags: repo.tags });
}
