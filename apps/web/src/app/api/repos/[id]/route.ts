import { getMockRepo, patchMockRepo } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const repo = getMockRepo(id);

  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(repo);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const repo = patchMockRepo(id, {
    isFavorite:
      typeof body.isFavorite === "boolean" ? body.isFavorite : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });

  if (!repo) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(repo);
}
