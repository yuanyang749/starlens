import { fail, ok, unauthorized } from "@/lib/api-response";
import { getApiUser } from "@/server/auth/api-user";
import { deleteRepoTag } from "@/server/repos/repository";

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
