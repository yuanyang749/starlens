import { searchMockRepos } from "@starlens/core";
import { fail, ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.query !== "string" || !body.query.trim()) {
    return fail("invalid_query", "Query is required.");
  }

  const items = searchMockRepos({
    q: body.query,
    pageSize: 10,
  }).items.map((repo, index) => ({
    ...repo,
    matchReason:
      index === 0
        ? "Strongest mock match across name, summary, tags, and note context."
        : "Relevant mock candidate from the database recall set.",
  }));

  return ok({ items });
}
