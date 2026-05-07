"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  DEFAULT_SEARCH_SORT,
  SEARCH_SORTS,
  type SearchSort,
} from "@starlens/core";

const SEARCH_SORT_SET = new Set<SearchSort>(SEARCH_SORTS);

function normalizeUrlValue(value: string | null, options: { lowercase?: boolean } = {}) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  return options.lowercase ? trimmed.toLowerCase() : trimmed;
}

function normalizeUrlSort(value: string | null): SearchSort {
  const normalized = value?.trim().toLowerCase() as SearchSort | undefined;

  return normalized && SEARCH_SORT_SET.has(normalized)
    ? normalized
    : DEFAULT_SEARCH_SORT;
}

function normalizeUrlFavorite(value: string | null) {
  return value?.trim().toLowerCase() === "true";
}

function normalizeUrlPage(value: string | null) {
  const parsed = Number(value?.trim());
  const page = Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
  return Math.max(page, 1);
}

function buildFilterParams(filters: {
  query: string;
  favoritesOnly: boolean;
  sort: SearchSort;
  language: string;
  page: number;
}) {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  const language = filters.language.trim();

  if (query) params.set("q", query);
  if (language) params.set("language", language);
  if (filters.favoritesOnly) params.set("favorite", "true");
  if (filters.sort !== DEFAULT_SEARCH_SORT) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));

  return params;
}

function readFiltersFromParams(params: Pick<URLSearchParams, "get">) {
  return {
    query: normalizeUrlValue(params.get("q")),
    favoritesOnly: normalizeUrlFavorite(params.get("favorite")),
    sort: normalizeUrlSort(params.get("sort")),
    language: normalizeUrlValue(params.get("language")),
    page: normalizeUrlPage(params.get("page")),
  };
}

export function useWorkbenchQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const initialFilters = useMemo(
    () => readFiltersFromParams(urlSearchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydration should keep the original URL state.
    [],
  );
  const lastSyncedQueryString = useRef<string | null>(urlSearchParams.toString());

  const [query, setQuery] = useState(initialFilters.query);
  const [favoritesOnly, setFavoritesOnly] = useState(initialFilters.favoritesOnly);
  const [sort, setSort] = useState<SearchSort>(initialFilters.sort);
  const [language, setLanguage] = useState(initialFilters.language);
  const [page, setPage] = useState(initialFilters.page);

  const filterParams = useMemo(
    () =>
      buildFilterParams({
        query,
        favoritesOnly,
        sort,
        language,
        page,
      }),
    [favoritesOnly, language, page, query, sort],
  );

  const searchParams = useMemo(() => {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(page));
    params.set("pageSize", String(DEFAULT_SEARCH_PAGE_SIZE));
    params.set("sort", sort);
    return params;
  }, [filterParams, page, sort]);

  useEffect(() => {
    const nextQueryString = urlSearchParams.toString();

    if (lastSyncedQueryString.current === nextQueryString) {
      return;
    }

    const nextFilters = readFiltersFromParams(urlSearchParams);
    lastSyncedQueryString.current = nextQueryString;
    setQuery(nextFilters.query);
    setFavoritesOnly(nextFilters.favoritesOnly);
    setSort(nextFilters.sort);
    setLanguage(nextFilters.language);
    setPage(nextFilters.page);
  }, [urlSearchParams]);

  useEffect(() => {
    const currentParams = new URLSearchParams(urlSearchParams.toString());

    for (const key of [
      "q",
      "language",
      "owner",
      "tag",
      "favorite",
      "sort",
      "page",
      "pageSize",
    ]) {
      currentParams.delete(key);
    }

    for (const [key, value] of filterParams) {
      currentParams.set(key, value);
    }

    const nextQueryString = currentParams.toString();

    if (nextQueryString === urlSearchParams.toString()) {
      lastSyncedQueryString.current = nextQueryString;
      return;
    }

    lastSyncedQueryString.current = nextQueryString;
    router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, {
      scroll: false,
    });
  }, [filterParams, pathname, router, urlSearchParams]);

  function clearFilters() {
    setQuery("");
    setFavoritesOnly(false);
    setLanguage("");
    setPage(1);
  }

  function resetSort() {
    setSort(DEFAULT_SEARCH_SORT);
    setPage(1);
  }

  return {
    query,
    setQuery,
    favoritesOnly,
    setFavoritesOnly,
    sort,
    setSort,
    language,
    setLanguage,
    page,
    setPage,
    clearFilters,
    resetSort,
    searchParams,
  };
}
