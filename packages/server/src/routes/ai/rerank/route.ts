import { searchMockRepos } from "@starlens-app/core";
import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";

export async function POST(request: Request) {
  const user = await getApiUser(request);
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
