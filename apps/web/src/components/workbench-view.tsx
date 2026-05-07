"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SEARCH_SORT,
  type PaginatedResult,
  type RepoSummary,
} from "@starlens/core";
import { X } from "lucide-react";
import { RepoDetailPanel } from "./workbench/repo-detail-panel";
import { RepoTablePane } from "./workbench/repo-table-pane";
import { useWorkbenchQueryState } from "./workbench/use-workbench-query-state";
import { WorkbenchSidebar } from "./workbench/workbench-sidebar";
import { formatDateTime } from "./workbench/workbench-formatters";
import { WorkbenchTopbar } from "./workbench/workbench-topbar";

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

type AiAskResult = {
  answer: string;
  candidates: Array<{ id: string; fullName: string }>;
  providerConfigId: string | null;
};

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

export function WorkbenchView({
  userName = "GitHub user",
  userAvatarUrl = null,
}: {
  userName?: string;
  userAvatarUrl?: string | null;
}) {
  const {
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
  } = useWorkbenchQueryState();

  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [allStarsTotal, setAllStarsTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [queryDraft, setQueryDraft] = useState(query);
  const [queryDirty, setQueryDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [syncing, setSyncing] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<RepoSummary[]>([]);
  const [recentMode, setRecentMode] = useState(false);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState<string | null>(null);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

  const refreshList = useCallback(() => {
    const controller = new AbortController();

    apiJson<PaginatedResult<RepoSummary>>(`/api/search?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setRepos(data.items);
        setTotal(data.total);
        if (!favoritesOnly && !aiSearchMode) {
          setAllStarsTotal(data.total);
        }
        setPageSize(data.pageSize);
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
  }, [aiSearchMode, favoritesOnly, searchParams]);

  const patchRepoInList = useCallback((repo: RepoSummary) => {
    setRepos((items) =>
      items.map((item) => (item.id === repo.id ? { ...item, ...repo } : item)),
    );
    setAiSearchResults((items) =>
      items.map((item) => (item.id === repo.id ? { ...item, ...repo } : item)),
    );
  }, []);

  const findRepoById = useCallback((repoId: string) => {
    if (selectedRepo?.id === repoId) {
      return selectedRepo;
    }

    return repos.find((item) => item.id === repoId)
      ?? aiSearchResults.find((item) => item.id === repoId)
      ?? null;
  }, [aiSearchResults, repos, selectedRepo]);

  useEffect(() => {
    const controller = refreshList();
    return () => controller.abort();
  }, [refreshList]);

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

  const updateRepo = useCallback(
    async (repoId: string, updates: { isFavorite?: boolean; note?: string }) => {
      const currentRepo = findRepoById(repoId);
      if (!currentRepo) return false;

      const isSelectedRepo = selectedRepo?.id === repoId;
      const prevSelectedRepo = selectedRepo;
      const optimisticRepo = { ...currentRepo, ...updates };

      if (isSelectedRepo) {
        setSelectedRepo(optimisticRepo);
        setNoteDraft(optimisticRepo.note);
      }
      patchRepoInList(optimisticRepo);

      try {
        const repo = await apiJson<RepoSummary>(`/api/repos/${repoId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (isSelectedRepo || selectedId === repoId) {
          setSelectedRepo(repo);
          setNoteDraft(repo.note);
        }
        patchRepoInList(repo);
        setError(null);
        return true;
      } catch (caught) {
        if (isSelectedRepo && prevSelectedRepo) {
          setSelectedRepo(prevSelectedRepo);
          setNoteDraft(prevSelectedRepo.note);
        }
        patchRepoInList(currentRepo);
        setError(
          caught instanceof Error
            ? `Detail request failed: ${caught.message}`
            : "Detail request failed: update failed.",
        );
        return false;
      }
    },
    [findRepoById, patchRepoInList, selectedId, selectedRepo],
  );

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
        if (!selectedRepo) return;
        void updateRepo(selectedRepo.id, { note: noteToSave });
      }, 600);
    },
    [selectedRepo, updateRepo],
  );

  useEffect(
    () => () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    },
    [],
  );

  async function syncNow() {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);

    try {
      const result = await apiJson<SyncResult>("/api/sync", { method: "POST" });
      setLastSync(result);
      const statusText = result.status === "success" ? "completed" : "failed";
      setSyncMessage(
        `Sync ${statusText}: ${result.counts.fetched} fetched, ${result.counts.unstarred} unstarred.`,
      );

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
        caught instanceof Error
          ? `Detail request failed: ${caught.message}`
          : "Detail request failed: add tag failed.",
      );
    } finally {
      setTagSubmitting(false);
    }
  }

  async function aiSearch() {
    if (aiSearching) return;

    const question = (queryDirty ? queryDraft : query).trim();

    if (!question) {
      setError("AI Search needs a query.");
      return;
    }

    setAiSearching(true);
    setError(null);
    setSyncMessage(null);

    try {
      const result = await apiJson<AiAskResult>("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const candidateIds = result.candidates.map((item) => item.id);
      const aiRepos = await Promise.all(
        candidateIds.map((id) => apiJson<RepoSummary>(`/api/repos/${id}`)),
      );

      setAiSearchResults(aiRepos);
      setAiSearchMode(true);
      setFavoritesOnly(false);
      setRecentMode(false);
      setPage(1);

      const firstCandidate = aiRepos[0];
      if (firstCandidate?.id) {
        setSelectedId(firstCandidate.id);
      } else {
        setSelectedId(null);
      }

      setSyncMessage(
        aiRepos.length > 0
          ? `AI Search: ${result.answer}`
          : "AI Search: 未找到匹配仓库，请尝试更具体关键词。",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `AI Search failed: ${caught.message}`
          : "AI Search failed.",
      );
    } finally {
      setAiSearching(false);
    }
  }

  function submitSearch() {
    const nextQuery = (queryDirty ? queryDraft : query).trim();

    if (!nextQuery) {
      return;
    }

    setError(null);
    setSyncMessage(null);
    setAiSearchMode(false);
    setRecentMode(false);

    const shouldRefreshImmediately =
      nextQuery === query.trim() && page === 1 && !aiSearchMode && !recentMode;

    setQuery(nextQuery);
    setQueryDraft(nextQuery);
    setQueryDirty(false);
    setPage(1);

    if (shouldRefreshImmediately) {
      refreshList();
    }
  }

  function updateQueryDraft(value: string) {
    setQueryDraft(value);
    setQueryDirty(true);
  }

  function clearFiltersAndDraft() {
    clearFilters();
    setQueryDraft("");
    setQueryDirty(false);
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
        caught instanceof Error
          ? `Detail request failed: ${caught.message}`
          : "Detail request failed: delete tag failed.",
      );
    } finally {
      setTagDeleting(null);
    }
  }

  const lastSyncText = useMemo(() => {
    if (lastSync) {
      return formatDateTime(lastSync.finishedAt);
    }

    if (selectedRepo) {
      return formatDateTime(selectedRepo.lastSyncedAt);
    }

    if (repos[0]) {
      return formatDateTime(repos[0].lastSyncedAt);
    }

    return "Not synced yet";
  }, [lastSync, repos, selectedRepo]);

  const favoriteCount = useMemo(
    () => repos.filter((repo) => repo.isFavorite).length,
    [repos],
  );

  const aiSearchPageSize = Math.max(1, pageSize);
  const aiSearchTotal = aiSearchResults.length;
  const aiSearchPagedRepos = useMemo(() => {
    const start = (page - 1) * aiSearchPageSize;
    return aiSearchResults.slice(start, start + aiSearchPageSize);
  }, [aiSearchPageSize, aiSearchResults, page]);

  const displayedRepos = aiSearchMode ? aiSearchPagedRepos : repos;
  const displayedTotal = aiSearchMode ? aiSearchTotal : total;
  const displayedSort = aiSearchMode ? "relevance" : sort;

  return (
    <div className="workbench-shell">
      <WorkbenchTopbar
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        queryDraft={queryDirty ? queryDraft : query}
        onQueryDraftChange={updateQueryDraft}
        onSearch={submitSearch}
        canSearch={Boolean((queryDirty ? queryDraft : query).trim())}
        aiSearching={aiSearching}
        onAiSearch={aiSearch}
      />

      {error ? (
        <div className="workbench-banner workbench-banner--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="workbench-banner__close"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {syncMessage ? (
        <div className="workbench-banner workbench-banner--info" role="status" aria-live="polite">
          <span>{syncMessage}</span>
          <button
            type="button"
            className="workbench-banner__close"
            aria-label="Dismiss message"
            onClick={() => setSyncMessage(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="workbench-body">
        <WorkbenchSidebar
          favoritesOnly={favoritesOnly}
          aiSearchActive={aiSearchMode}
          onFavoritesClick={() => {
            setAiSearchMode(false);
            setFavoritesOnly(true);
            setRecentMode(false);
            setPage(1);
          }}
          onAllStarsClick={() => {
            setAiSearchMode(false);
            setFavoritesOnly(false);
            setRecentMode(false);
            setSort(DEFAULT_SEARCH_SORT);
            setPage(1);
          }}
          onRecentClick={() => {
            setAiSearchMode(false);
            setFavoritesOnly(false);
            setRecentMode(true);
            setSort("recent");
            setPage(1);
          }}
          onAiSearchClick={() => {
            setAiSearchMode(true);
            setFavoritesOnly(false);
            setRecentMode(false);
            setPage(1);
          }}
          recentActive={recentMode}
          total={allStarsTotal}
          favoriteCount={favoriteCount}
          lastSyncText={lastSyncText}
          syncStatusText={
            lastSync ? `${lastSync.counts.fetched} repos · ${lastSync.status}` : `${allStarsTotal} repos tracked`
          }
        />

        <RepoTablePane
          repos={displayedRepos}
          total={displayedTotal}
          mode={aiSearchMode ? "ai_search" : "default"}
          page={page}
          pageSize={aiSearchMode ? aiSearchPageSize : pageSize}
          selectedId={selectedId}
          onSelect={setSelectedId}
          syncNow={syncNow}
          syncing={syncing}
          language={language}
          favoritesOnly={favoritesOnly}
          sort={displayedSort}
          onLanguageChange={(value) => {
            if (aiSearchMode) return;
            setLanguage(value);
            setPage(1);
          }}
          onFavoritesToggle={() => {
            if (aiSearchMode) return;
            setFavoritesOnly((value) => !value);
            setPage(1);
          }}
          onClearFilters={() => {
            if (aiSearchMode) return;
            clearFiltersAndDraft();
          }}
          onResetSort={() => {
            if (aiSearchMode) return;
            resetSort();
          }}
          onSortChange={(value) => {
            if (aiSearchMode) return;
            setSort(value);
            setRecentMode(false);
            setPage(1);
          }}
          onPageChange={(nextPage) => setPage(nextPage)}
          onFavoriteToggleRepo={async (repo) => {
            if (favoriteUpdatingId) return;
            setFavoriteUpdatingId(repo.id);
            await updateRepo(repo.id, { isFavorite: !repo.isFavorite });
            setFavoriteUpdatingId(null);
          }}
          favoriteUpdatingId={favoriteUpdatingId}
        />

        <RepoDetailPanel
          repo={selectedRepo}
          noteDraft={noteDraft}
          newTag={newTag}
          favoriteUpdating={Boolean(selectedRepo && favoriteUpdatingId === selectedRepo.id)}
          tagSubmitting={tagSubmitting}
          tagDeleting={tagDeleting}
          onClose={() => setSelectedId(null)}
          onFavoriteToggle={async () => {
            if (!selectedRepo || favoriteUpdatingId) return;
            setFavoriteUpdatingId(selectedRepo.id);
            await updateRepo(selectedRepo.id, { isFavorite: !selectedRepo.isFavorite });
            setFavoriteUpdatingId(null);
          }}
          onNoteChange={(value) => {
            setNoteDraft(value);
            scheduleNoteSave(value);
          }}
          onSaveNote={() => scheduleNoteSave(noteDraft)}
          onNewTagChange={setNewTag}
          onAddTag={addTag}
          onDeleteTag={deleteTag}
        />
      </div>
    </div>
  );
}
