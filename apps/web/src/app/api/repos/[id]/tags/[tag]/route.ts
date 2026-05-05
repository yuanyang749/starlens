import { deleteMockRepoTag } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string; tag: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, tag } = await context.params;
  const result = deleteMockRepoTag(id, decodeURIComponent(tag));

  if (!result) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(result);
}
