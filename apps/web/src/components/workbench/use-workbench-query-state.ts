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

function buildFilterParams(filters: {
  query: string;
  favoritesOnly: boolean;
  sort: SearchSort;
  language: string;
  owner: string;
  tagFilter: string;
}) {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  const language = filters.language.trim();
  const owner = filters.owner.trim();
  const tag = filters.tagFilter.trim().toLowerCase();

  if (query) params.set("q", query);
  if (language) params.set("language", language);
  if (owner) params.set("owner", owner);
  if (tag) params.set("tag", tag);
  if (filters.favoritesOnly) params.set("favorite", "true");
  if (filters.sort !== DEFAULT_SEARCH_SORT) params.set("sort", filters.sort);

  return params;
}

function readFiltersFromParams(params: Pick<URLSearchParams, "get">) {
  return {
    query: normalizeUrlValue(params.get("q")),
    favoritesOnly: normalizeUrlFavorite(params.get("favorite")),
    sort: normalizeUrlSort(params.get("sort")),
    language: normalizeUrlValue(params.get("language")),
    owner: normalizeUrlValue(params.get("owner")),
    tagFilter: normalizeUrlValue(params.get("tag"), { lowercase: true }),
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
  const [owner, setOwner] = useState(initialFilters.owner);
  const [tagFilter, setTagFilter] = useState(initialFilters.tagFilter);

  const filterParams = useMemo(
    () =>
      buildFilterParams({
        query,
        favoritesOnly,
        sort,
        language,
        owner,
        tagFilter,
      }),
    [favoritesOnly, language, owner, query, sort, tagFilter],
  );

  const searchParams = useMemo(() => {
    const params = new URLSearchParams(filterParams);
    params.set("pageSize", String(DEFAULT_SEARCH_PAGE_SIZE));
    params.set("sort", sort);
    return params;
  }, [filterParams, sort]);

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
    setOwner(nextFilters.owner);
    setTagFilter(nextFilters.tagFilter);
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
    setOwner("");
    setTagFilter("");
  }

  function resetSort() {
    setSort(DEFAULT_SEARCH_SORT);
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
    owner,
    setOwner,
    tagFilter,
    setTagFilter,
    clearFilters,
    resetSort,
    searchParams,
  };
}
