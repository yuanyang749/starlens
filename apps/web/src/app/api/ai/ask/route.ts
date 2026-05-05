import { searchMockRepos } from "@starlens/core";
import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.question !== "string" || !body.question.trim()) {
    return fail("invalid_question", "Question is required.");
  }

  const candidates = searchMockRepos({
    q: body.question,
    pageSize: 3,
  }).items;

  return ok({
    answer:
      candidates.length > 0
        ? `Mock AI found ${candidates[0].fullName} as the strongest match, then compared it with ${candidates
            .slice(1)
            .map((repo) => repo.fullName)
            .join(", ") || "no close alternates"}.`
        : "Mock AI could not find a close candidate in the current sample set.",
    candidates,
    providerConfigId: body.providerConfigId ?? null,
  });
}
