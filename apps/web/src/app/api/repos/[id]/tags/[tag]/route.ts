import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";
import { deleteRepoTag } from "@/server/repos/repository";

type RouteContext = {
  params: Promise<{ id: string; tag: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

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
