import {
  DEFAULT_SEARCH_PAGE,
  DEFAULT_SEARCH_PAGE_SIZE,
  DEFAULT_SEARCH_SORT,
  MAX_SEARCH_PAGE_SIZE,
  SEARCH_SORTS,
  type SearchReposInput,
  type SearchSort,
} from "@starlens-app/core";
import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { searchRepos } from "@starlens/server/server/repos/repository";

const SEARCH_SORT_SET = new Set<SearchSort>(SEARCH_SORTS);

function stringParam(value: string | null, options: { lowercase?: boolean } = {}) {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  return options.lowercase ? normalized.toLowerCase() : normalized;
}

function numberParam(value: string | null, fallback: number, min: number, max?: number) {
  const parsed = value?.trim() ? Number(value) : fallback;
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  const lowerBounded = Math.max(integer, min);

  return max === undefined ? lowerBounded : Math.min(lowerBounded, max);
}

function booleanParam(value: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function sortParam(value: string | null) {
  const normalized = value?.trim().toLowerCase() as SearchSort | undefined;

  if (normalized && SEARCH_SORT_SET.has(normalized)) {
    return normalized;
  }

  return DEFAULT_SEARCH_SORT;
}

export function normalizeSearchParams(params: URLSearchParams): SearchReposInput {
  return {
    q: stringParam(params.get("q")),
    page: numberParam(params.get("page"), DEFAULT_SEARCH_PAGE, 1),
    pageSize: numberParam(
      params.get("pageSize"),
      DEFAULT_SEARCH_PAGE_SIZE,
      1,
      MAX_SEARCH_PAGE_SIZE,
    ),
    language: stringParam(params.get("language")),
    owner: stringParam(params.get("owner")),
    tag: stringParam(params.get("tag"), { lowercase: true }),
    favorite: booleanParam(params.get("favorite")),
    sort: sortParam(params.get("sort")),
  };
}

export async function GET(request: Request) {
  const user = await getApiUser(request);

  if (!user) {
    return unauthorized();
  }

  const params = new URL(request.url).searchParams;
  const data = await searchRepos(user.id, normalizeSearchParams(params));

  return ok(data);
}
