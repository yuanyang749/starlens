import { fail, ok, unauthorized } from "@/lib/api-response";
import { getApiUser } from "@/server/auth/api-user";
import { getRepoDetail, updateRepoCuration } from "@/server/repos/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getApiUser(request);

  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const repo = await getRepoDetail(user.id, id);

  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(repo);
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getApiUser(request);

  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const repo = await updateRepoCuration(user.id, id, {
    isFavorite:
      typeof body.isFavorite === "boolean" ? body.isFavorite : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });

  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(repo);
}
