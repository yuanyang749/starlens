import { addMockRepoTag } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.tag !== "string" || !body.tag.trim()) {
    return fail("invalid_tag", "Tag is required.");
  }

  const result = addMockRepoTag(id, body.tag);
  if (!result) {
    return fail("repo_not_found", "Repository was not found.", 404);
  }

  return ok(result);
}
