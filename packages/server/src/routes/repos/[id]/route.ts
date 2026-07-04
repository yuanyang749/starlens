import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { getRepoDetail, resolveRepoRowId, updateRepoCuration } from "@starlens/server/server/repos/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getApiUser(request);

  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const resolvedId = await resolveRepoRowId(user.id, id);

  if (!resolvedId) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  const repo = await getRepoDetail(user.id, resolvedId);

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
  const resolvedId = await resolveRepoRowId(user.id, id);

  if (!resolvedId) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  const body = await request.json().catch(() => ({}));
  const repo = await updateRepoCuration(user.id, resolvedId, {
    isFavorite:
      typeof body.isFavorite === "boolean" ? body.isFavorite : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });

  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(repo);
}
