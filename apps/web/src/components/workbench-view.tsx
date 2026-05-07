"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SEARCH_SORT,
  type PaginatedResult,
  type RepoSummary,
  type SearchSort,
} from "@starlens/core";
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
    owner,
    setOwner,
    tagFilter,
    setTagFilter,
    clearFilters,
    resetSort,
    searchParams,
  } = useWorkbenchQueryState();

  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [favoriteUpdating, setFavoriteUpdating] = useState(false);
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

  const updateSelected = useCallback(
    async (updates: { isFavorite?: boolean; note?: string }) => {
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
    },
    [patchRepoInList, selectedRepo],
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
        void updateSelected({ note: noteToSave });
      }, 600);
    },
    [updateSelected],
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

    const question =
      query.trim() ||
      selectedRepo?.fullName ||
      selectedRepo?.repoSummary ||
      "";

    if (!question) {
      setAiStatusMessage("请输入关键词，或先选择一个仓库。");
      setError("AI Search needs a query or a selected repository.");
      return;
    }

    setAiSearching(true);
    setAiStatusMessage("正在检索...");
    setError(null);

    try {
      const result = await apiJson<AiAskResult>("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const firstCandidate = result.candidates[0];
      if (firstCandidate?.id) {
        setSelectedId(firstCandidate.id);
      }

      setAiStatusMessage(
        result.candidates.length > 0
          ? `已匹配 ${result.candidates.length} 个候选仓库`
          : "未找到匹配仓库",
      );
      setSyncMessage(`AI Search: ${result.answer}`);
    } catch (caught) {
      setAiStatusMessage("搜索失败，请稍后重试。");
      setError(
        caught instanceof Error
          ? `AI Search failed: ${caught.message}`
          : "AI Search failed.",
      );
    } finally {
      setAiSearching(false);
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

  return (
    <div className="workbench-shell">
      <WorkbenchTopbar
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        query={query}
        onQueryChange={setQuery}
        syncing={syncing}
        aiSearching={aiSearching}
        aiStatusMessage={aiStatusMessage}
        onSync={syncNow}
        onAiSearch={aiSearch}
      />

      {error ? <div className="workbench-banner workbench-banner--error">{error}</div> : null}
      {syncMessage ? (
        <div className="workbench-banner workbench-banner--info">{syncMessage}</div>
      ) : null}

      <div className="workbench-body">
        <WorkbenchSidebar
          favoritesOnly={favoritesOnly}
          onFavoritesClick={() => setFavoritesOnly(true)}
          onAllStarsClick={() => {
            setFavoritesOnly(false);
            setSort(DEFAULT_SEARCH_SORT);
          }}
          onRecentClick={() => {
            setFavoritesOnly(false);
            setSort("recent");
          }}
          recentActive={sort === "recent"}
          total={total}
          favoriteCount={favoriteCount}
          lastSyncText={lastSyncText}
          syncStatusText={
            lastSync ? `${lastSync.counts.fetched} repos · ${lastSync.status}` : `${total} repos tracked`
          }
        />

        <RepoTablePane
          repos={repos}
          total={total}
          selectedId={selectedId}
          onSelect={setSelectedId}
          syncNow={syncNow}
          syncing={syncing}
          language={language}
          owner={owner}
          tagFilter={tagFilter}
          favoritesOnly={favoritesOnly}
          sort={sort}
          onLanguageChange={setLanguage}
          onOwnerChange={setOwner}
          onTagFilterChange={setTagFilter}
          onFavoritesToggle={() => setFavoritesOnly((value) => !value)}
          onClearFilters={clearFilters}
          onResetSort={resetSort}
          onSortChange={setSort as (value: SearchSort) => void}
        />

        <RepoDetailPanel
          repo={selectedRepo}
          noteDraft={noteDraft}
          newTag={newTag}
          favoriteUpdating={favoriteUpdating}
          tagSubmitting={tagSubmitting}
          tagDeleting={tagDeleting}
          onClose={() => setSelectedId(null)}
          onFavoriteToggle={async () => {
            if (!selectedRepo || favoriteUpdating) return;
            setFavoriteUpdating(true);
            await updateSelected({ isFavorite: !selectedRepo.isFavorite });
            setFavoriteUpdating(false);
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
