import { searchMockRepos, type SearchSort } from "@starlens/core";
import { ok } from "@/lib/api-response";

function numberParam(value: string | null) {
  return value ? Number(value) : undefined;
}

function booleanParam(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sort = params.get("sort") as SearchSort | null;

  const data = searchMockRepos({
    q: params.get("q") ?? undefined,
    page: numberParam(params.get("page")),
    pageSize: numberParam(params.get("pageSize")),
    language: params.get("language") ?? undefined,
    owner: params.get("owner") ?? undefined,
    tag: params.get("tag") ?? undefined,
    favorite: booleanParam(params.get("favorite")),
    sort: sort ?? undefined,
  });

  return ok(data);
}
