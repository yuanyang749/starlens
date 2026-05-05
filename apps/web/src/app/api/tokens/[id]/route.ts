import { ok } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  await context.params;

  return ok({ revoked: true });
}
