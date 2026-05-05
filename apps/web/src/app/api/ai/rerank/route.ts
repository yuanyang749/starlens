import { searchMockRepos } from "@starlens/core";
import { fail, ok } from "@/lib/api-response";

export async function POST(request: Request) {
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
