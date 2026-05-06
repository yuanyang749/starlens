"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  DEFAULT_SEARCH_SORT,
  SEARCH_SORTS,
  type PaginatedResult,
  type RepoSummary,
  type SearchSort,
} from "@starlens/core";
import {
  Bot,
  Check,
  Clock3,
  ExternalLink,
  FolderGit2,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  X,
} from "lucide-react";

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type SyncResult = {
  status: "success" | "error";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pageCount: number;
  failedCount: number;
  errorSummary: string | null;
  errorLevel: "auth" | "rate_limit" | "network" | "unknown" | null;
  counts: {
    fetched: number;
    insertedOrUpdated: number;
    unstarred: number;
  };
  history: Array<{
    startedAt: string;
    status: "success" | "error";
    counts: { fetched: number; insertedOrUpdated: number; unstarred: number };
    errorSummary: string | null;
  }>;
};

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

const SOURCE_LABELS: Record<string, string> = {
  github_description: "GitHub original description",
  github_topics: "GitHub topics",
  github_readme: "GitHub README",
  github_readme_excerpt: "GitHub README excerpt",
  repo_metadata: "Repository metadata",
  curation_metadata: "Notes and tags",
  system_fallback: "System fallback",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "Not updated yet";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function CollapsibleText({
  text,
  className = "",
  limit = 280,
}: {
  text: string;
  className?: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = text.length > limit;
  const visibleText =
    shouldCollapse && !expanded ? `${text.slice(0, limit).trim()}...` : text;

  return (
    <div>
      <p className={className}>{visibleText}</p>
      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-medium text-[color:var(--accent)]"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (caught) {
    throw new Error(
      `Network request failed: ${
        caught instanceof Error ? caught.message : "Please check your connection."
      }`,
    );
  }
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("Response parsing failed: server returned invalid JSON.");
  }

  if (!payload.ok) {
    throw new Error(`Business request failed: ${payload.error.message}`);
  }

  return payload.data;
}

export function WorkbenchView() {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const initialFilters = useMemo(
    () => readFiltersFromParams(urlSearchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial state must match the URL used for hydration.
    [],
  );
  const lastSyncedQueryString = useRef<string | null>(urlSearchParams.toString());
  const [query, setQuery] = useState(initialFilters.query);
  const [favoritesOnly, setFavoritesOnly] = useState(initialFilters.favoritesOnly);
  const [sort, setSort] = useState<SearchSort>(initialFilters.sort);
  const [language, setLanguage] = useState(initialFilters.language);
  const [owner, setOwner] = useState(initialFilters.owner);
  const [tagFilter, setTagFilter] = useState(initialFilters.tagFilter);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [favoriteUpdating, setFavoriteUpdating] = useState(false);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

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

  const refreshList = useCallback(() => {
    const controller = new AbortController();

    apiJson<PaginatedResult<RepoSummary>>(`/api/search?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setRepos(data.items);
        setTotal(data.total);
        setError(null);
        setSelectedId((current) =>
          data.items.some((repo) => repo.id === current)
            ? current
            : data.items[0]?.id ?? null,
        );
        if (data.items.length === 0) {
          setSelectedRepo(null);
          setNoteDraft("");
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError(
          caught instanceof Error
            ? `List request failed: ${caught.message}`
            : "List request failed: search failed.",
        );
      });

    return controller;
  }, [searchParams]);

  const patchRepoInList = useCallback((repo: RepoSummary) => {
    setRepos((items) =>
      items.map((item) => (item.id === repo.id ? { ...item, ...repo } : item)),
    );
  }, []);

  useEffect(() => {
    const controller = refreshList();
    return () => controller.abort();
  }, [refreshList]);

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

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const controller = new AbortController();
    apiJson<RepoSummary>(`/api/repos/${selectedId}`, { signal: controller.signal })
      .then((repo) => {
        setSelectedRepo(repo);
        setNoteDraft(repo.note);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError(
          caught instanceof Error
            ? `Detail request failed: ${caught.message}`
            : "Detail request failed: loading failed.",
        );
      });

    return () => controller.abort();
  }, [selectedId]);

  async function syncNow() {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);

    try {
      const result = await apiJson<SyncResult>("/api/sync", { method: "POST" });
      setLastSync(result);
      const statusText = result.status === "success" ? "completed" : "failed";
      setSyncMessage(`Sync ${statusText}: ${result.counts.fetched} fetched, ${result.counts.unstarred} unstarred.`);

      if (result.status === "error") {
        const levelHint =
          result.errorLevel === "auth"
            ? "GitHub token may be expired, please reconnect."
            : result.errorLevel === "rate_limit"
              ? "GitHub API rate limit reached, retry later."
              : result.errorLevel === "network"
                ? "Network issue detected, please retry."
                : "Unknown sync issue.";
        setError(`${levelHint}${result.errorSummary ? ` (${result.errorSummary})` : ""}`);
      }
      refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function updateSelected(updates: { isFavorite?: boolean; note?: string }) {
    if (!selectedRepo) return false;

    const prevRepo = selectedRepo;
    const optimisticRepo = { ...selectedRepo, ...updates };
    setSelectedRepo(optimisticRepo);
    patchRepoInList(optimisticRepo);

    try {
      const repo = await apiJson<RepoSummary>(`/api/repos/${selectedRepo.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      setSelectedRepo(repo);
      setNoteDraft(repo.note);
      patchRepoInList(repo);
      setError(null);
      return true;
    } catch (caught) {
      setSelectedRepo(prevRepo);
      setNoteDraft(prevRepo.note);
      patchRepoInList(prevRepo);
      setError(
        caught instanceof Error
          ? `Detail request failed: ${caught.message}`
          : "Detail request failed: update failed.",
      );
      return false;
    }
  }

  const scheduleNoteSave = useCallback(
    (nextNote: string) => {
      pendingNoteRef.current = nextNote;
      if (noteDebounceRef.current) {
        clearTimeout(noteDebounceRef.current);
      }
      noteDebounceRef.current = setTimeout(() => {
        if (pendingNoteRef.current === null) return;
        const noteToSave = pendingNoteRef.current;
        pendingNoteRef.current = null;
        void updateSelected({ note: noteToSave });
      }, 600);
    },
    [updateSelected],
  );

  async function addTag() {
    if (!selectedRepo || !newTag.trim() || tagSubmitting) return;

    const tag = newTag.trim().toLowerCase();
    if (selectedRepo.tags.includes(tag)) return;

    setTagSubmitting(true);
    const prevRepo = selectedRepo;
    const optimisticRepo = { ...selectedRepo, tags: [...selectedRepo.tags, tag] };
    setSelectedRepo(optimisticRepo);
    patchRepoInList(optimisticRepo);
    setNewTag("");

    try {
      await apiJson<{ tags: string[] }>(`/api/repos/${selectedRepo.id}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      setError(null);
    } catch (caught) {
      setSelectedRepo(prevRepo);
      patchRepoInList(prevRepo);
      setNewTag(tag);
      setError(
        caught instanceof Error ? `Detail request failed: ${caught.message}` : "Detail request failed: add tag failed.",
      );
    } finally {
      setTagSubmitting(false);
    }
  }

  async function deleteTag(tag: string) {
    if (!selectedRepo || tagDeleting) return;

    setTagDeleting(tag);
    const prevRepo = selectedRepo;
    const optimisticRepo = {
      ...selectedRepo,
      tags: selectedRepo.tags.filter((item) => item !== tag),
    };
    setSelectedRepo(optimisticRepo);
    patchRepoInList(optimisticRepo);

    try {
      await apiJson<{ tags: string[] }>(
        `/api/repos/${selectedRepo.id}/tags/${encodeURIComponent(tag)}`,
        { method: "DELETE" },
      );
      setError(null);
    } catch (caught) {
      setSelectedRepo(prevRepo);
      patchRepoInList(prevRepo);
      setError(
        caught instanceof Error ? `Detail request failed: ${caught.message}` : "Detail request failed: delete tag failed.",
      );
    } finally {
      setTagDeleting(null);
    }
  }

  useEffect(
    () => () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    },
    [],
  );

  const selectedGithubUrl = selectedRepo
    ? safeExternalUrl(selectedRepo.htmlUrl)
    : null;
  const selectedHomepageUrl = selectedRepo?.homepage
    ? safeExternalUrl(selectedRepo.homepage)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="app-panel rounded-[24px] p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3 text-sm text-[color:var(--muted)]">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search repo names, tags, notes, and summaries"
                className="w-full bg-transparent text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setFavoritesOnly((value) => !value)}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                  favoritesOnly
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--foreground)]"
                    : "border-[color:var(--line)] bg-[color:var(--panel-strong)] text-[color:var(--muted)]"
                }`}
              >
                <Star className="h-4 w-4" />
                Favorites
              </button>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm font-medium text-[color:var(--foreground)] disabled:opacity-60"
              >
                <Clock3 className="h-4 w-4 text-[color:var(--accent)]" />
                {syncing ? "Syncing" : "Sync now"}
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white"
              >
                <Sparkles className="h-4 w-4" />
                AI search
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="Language"
              className="h-10 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm outline-none"
            />
            <input
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              placeholder="Owner"
              className="h-10 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm outline-none"
            />
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Tag"
              className="h-10 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm outline-none"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SearchSort)}
              className="h-10 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm outline-none"
            >
              <option value="updated">Updated</option>
              <option value="recent">Recently starred</option>
              <option value="stars">Most stars</option>
              <option value="relevance">Relevance</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 text-sm font-medium text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
            <button
              type="button"
              onClick={resetSort}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 text-sm font-medium text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)]"
            >
              Reset sort
            </button>
          </div>

          {error ? (
            <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {syncMessage ? (
            <div className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--accent-soft)] px-4 py-3 text-sm text-[color:var(--accent)]">
              {syncMessage}
            </div>
          ) : null}
          {lastSync ? (
            <div className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3 text-sm text-[color:var(--muted)]">
              Last sync: {new Date(lastSync.finishedAt).toLocaleString()} · {lastSync.counts.fetched} repos · {lastSync.status}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="app-panel overflow-hidden rounded-[24px]">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[color:var(--foreground)]">
                Starred repositories
              </p>
              <p className="text-sm text-[color:var(--muted)]">
                {total} matching repos from your synced GitHub stars.
              </p>
            </div>
            <div className="rounded-full bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--muted)]">
              Live data
            </div>
          </div>
          <div className="divide-y divide-[color:var(--line)]">
            {repos.map((repo) => {
              const selected = repo.id === selectedId;

              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => setSelectedId(repo.id)}
                  className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition ${
                    selected
                      ? "bg-[rgba(57,95,130,0.08)]"
                      : "bg-transparent hover:bg-[rgba(57,95,130,0.04)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <p className="truncate text-base font-semibold tracking-tight text-[color:var(--foreground)]">
                          {repo.fullName}
                        </p>
                        {repo.isFavorite ? (
                          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-2 text-xs font-medium text-[color:var(--accent)]">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            Favorite
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--muted)]">
                        {repo.repoSummary}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm text-[color:var(--muted)]">
                      <div>{formatCompactNumber(repo.stargazersCount)} stars</div>
                      <div>{formatDate(repo.pushedAtGithub)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-2)] px-2.5 py-1">
                      <FolderGit2 className="h-3.5 w-3.5" />
                      {repo.language}
                    </span>
                    {repo.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--line)] px-2.5 py-1"
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
            {repos.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-[color:var(--foreground)]">
                  No synced repositories yet.
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-[color:var(--muted)]">
                  Run your first GitHub sync to import public starred repos into
                  the workbench.
                </p>
                <button
                  type="button"
                  onClick={syncNow}
                  disabled={syncing}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  <Clock3 className="h-4 w-4" />
                  {syncing ? "Syncing" : "Start first sync"}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-5">
          {selectedRepo ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[color:var(--muted)]">
                    Selected repository
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
                    {selectedRepo.fullName}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (favoriteUpdating) return;
                      setFavoriteUpdating(true);
                      await updateSelected({ isFavorite: !selectedRepo.isFavorite });
                      setFavoriteUpdating(false);
                    }}
                    disabled={favoriteUpdating}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--line)] px-4 text-sm font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--accent)]"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        selectedRepo.isFavorite ? "fill-current text-[color:var(--accent)]" : ""
                      }`}
                    />
                    {selectedRepo.isFavorite ? "Favorited" : "Favorite"}
                  </button>
                  {selectedGithubUrl ? (
                    <a
                      href={selectedGithubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--line)] px-4 text-sm font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--accent)]"
                    >
                      Open on GitHub
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4 2xl:grid-cols-3">
                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4 2xl:col-span-1">
                  <p className="text-xs uppercase text-[color:var(--muted)]">
                    GitHub original description
                  </p>
                  <CollapsibleText
                    text={selectedRepo.description}
                    limit={220}
                    className="mt-2 text-sm leading-7 text-[color:var(--foreground)]"
                  />
                </div>
                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4 2xl:col-span-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs uppercase text-[color:var(--muted)]">
                      System summary
                    </p>
                    <span className="text-[11px] text-[color:var(--muted)]">
                      {formatDateTime(selectedRepo.repoSummaryUpdatedAt)}
                    </span>
                  </div>
                  <CollapsibleText
                    text={selectedRepo.repoSummary}
                    limit={260}
                    className="mt-2 text-sm leading-7 text-[color:var(--foreground)]"
                  />
                  <p className="mt-2 text-xs text-[color:var(--muted)]">
                    Source:{" "}
                    {SOURCE_LABELS[selectedRepo.repoSummarySource] ??
                      selectedRepo.repoSummarySource}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
                  <p className="text-xs uppercase text-[color:var(--muted)]">Stats</p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]">
                    {formatCompactNumber(selectedRepo.stargazersCount)} stars,{" "}
                    {formatCompactNumber(selectedRepo.watchersCount)} watchers,{" "}
                    {formatCompactNumber(selectedRepo.forksCount)} forks,{" "}
                    {selectedRepo.openIssuesCount} open issues.
                  </p>
                </div>
                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4 2xl:col-span-3">
                  <p className="text-xs uppercase text-[color:var(--muted)]">
                    Source context
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]">
                    {selectedRepo.visibility}, {selectedRepo.license.name}, branch{" "}
                    {selectedRepo.defaultBranch}.
                    {selectedRepo.archived ? " Archived." : ""}
                    {selectedRepo.isFork ? " Fork." : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                    <span>Created {formatDateTime(selectedRepo.createdAtGithub)}</span>
                    <span>Updated {formatDateTime(selectedRepo.updatedAtGithub)}</span>
                    <span>Synced {formatDateTime(selectedRepo.lastSyncedAt)}</span>
                    <span>
                      Search index:{" "}
                      {SOURCE_LABELS[selectedRepo.searchDocumentSource] ??
                        selectedRepo.searchDocumentSource}
                      , {formatDateTime(selectedRepo.searchDocumentUpdatedAt)}
                    </span>
                    {selectedHomepageUrl ? (
                      <a
                        href={selectedHomepageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[color:var(--accent)]"
                      >
                        Homepage <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[22px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-[color:var(--foreground)]">
                      Personal note
                    </p>
                    <button
                      type="button"
                      onClick={() => scheduleNoteSave(noteDraft)}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-[color:var(--foreground)] px-3 text-xs font-medium text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNoteDraft(value);
                      scheduleNoteSave(value);
                    }}
                    className="min-h-36 w-full resize-none rounded-[18px] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3 text-sm leading-7 text-[color:var(--foreground)] outline-none"
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedRepo.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => deleteTag(tag)}
                        disabled={Boolean(tagDeleting)}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--accent)]"
                      >
                        {tag}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      placeholder="New tag"
                      className="h-9 min-w-0 flex-1 rounded-full border border-[color:var(--line)] bg-white px-3 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      disabled={tagSubmitting}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-[color:var(--line)] px-3 text-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                      <Bot className="h-4 w-4 text-[color:var(--accent)]" />
                      System summary / README context
                    </div>
                    <span className="text-[11px] text-[color:var(--muted)]">
                      README {formatDateTime(selectedRepo.readmeExcerptUpdatedAt)}
                    </span>
                  </div>
                  <CollapsibleText
                    text={selectedRepo.aiSummary || selectedRepo.readmeExcerpt}
                    limit={520}
                    className="text-sm leading-7 text-[color:var(--muted)]"
                  />
                  <div className="mt-5 rounded-[18px] border border-dashed border-[color:var(--line)] bg-[rgba(57,95,130,0.06)] p-4 text-sm text-[color:var(--muted)]">
                    README source:{" "}
                    {SOURCE_LABELS[selectedRepo.readmeExcerptSource] ??
                      selectedRepo.readmeExcerptSource}
                    . AI calls stay disabled in this milestone; database search remains
                    the source of recall.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-96 items-center justify-center text-center">
              <div>
                <p className="text-sm font-medium text-[color:var(--foreground)]">
                  Select a repository
                </p>
                <p className="mt-2 max-w-sm text-sm leading-7 text-[color:var(--muted)]">
                  After your first sync, choose a repo from the list to inspect
                  metadata, notes, tags, and summaries.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
