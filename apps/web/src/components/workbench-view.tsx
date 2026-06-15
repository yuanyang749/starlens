"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SEARCH_SORT,
  type PaginatedResult,
  type RepoSummary,
} from "@starlens/core";
import { X } from "lucide-react";
import { AISettingsView } from "./ai-settings-view";
import { GeneralSettingsView } from "./general-settings-view";
import { RepoDetailPanel } from "./workbench/repo-detail-panel";
import { RepoTablePane } from "./workbench/repo-table-pane";
import { useWorkbenchQueryState } from "./workbench/use-workbench-query-state";
import { WorkbenchSidebar } from "./workbench/workbench-sidebar";
import { formatDateTime } from "./workbench/workbench-formatters";
import { WorkbenchTopbar } from "./workbench/workbench-topbar";
import { TokensSettingsView } from "./tokens-settings-view";

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
  candidates: Array<{
    id: string;
    fullName: string;
    reason?: string;
    source?: string;
  }>;
  providerConfigId: string | null;
};

async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (caught) {
    throw new Error(
      `网络请求失败：${
        caught instanceof Error ? caught.message : "请检查网络连接。"
      }`,
    );
  }

  let payload: ApiResponse<T>;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("响应解析失败：服务器返回了无效 JSON。");
  }

  if (!payload.ok) {
    throw new Error(`业务请求失败：${payload.error.message}`);
  }

  return payload.data;
}

export function WorkbenchView({
  userName = "GitHub 用户",
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
    tagFilter,
    setTagFilter,
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
  const [aiSearchInsights, setAiSearchInsights] = useState<
    Array<{ id: string; fullName: string; reason: string; source: string | null }>
  >([]);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [noteSaveFeedback, setNoteSaveFeedback] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [syncing, setSyncing] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<RepoSummary[]>([]);
  const [recentMode, setRecentMode] = useState(false);
  const [contentMode, setContentMode] = useState<"repos" | "general" | "providers" | "tokens">("repos");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState<string | null>(null);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
            ? `列表请求失败：${caught.message}`
            : "列表请求失败：搜索失败。",
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
            ? `详情请求失败：${caught.message}`
            : "详情请求失败：加载失败。",
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
            ? `详情请求失败：${caught.message}`
            : "详情请求失败：更新失败。",
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

  const showNoteSaveFeedback = useCallback((message: string) => {
    setNoteSaveFeedback(message);

    if (noteFeedbackTimeoutRef.current) {
      clearTimeout(noteFeedbackTimeoutRef.current);
    }

    noteFeedbackTimeoutRef.current = setTimeout(() => {
      setNoteSaveFeedback(null);
      noteFeedbackTimeoutRef.current = null;
    }, 1800);
  }, []);

  const saveNoteNow = useCallback(async () => {
    if (!selectedRepo) return;

    if (noteDebounceRef.current) {
      clearTimeout(noteDebounceRef.current);
      noteDebounceRef.current = null;
    }
    pendingNoteRef.current = null;

    const saved = await updateRepo(selectedRepo.id, { note: noteDraft });
    if (saved) {
      showNoteSaveFeedback("已保存");
    }
  }, [noteDraft, selectedRepo, showNoteSaveFeedback, updateRepo]);

  useEffect(
    () => () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
      if (noteFeedbackTimeoutRef.current) clearTimeout(noteFeedbackTimeoutRef.current);
    },
    [],
  );

  async function syncNow() {
    setSyncing(true);
    setSyncMessage(null);
    setAiSearchInsights([]);
    setError(null);

    try {
      const result = await apiJson<SyncResult>("/api/sync", { method: "POST" });
      setLastSync(result);
      const statusText = result.status === "success" ? "完成" : "失败";
      setSyncMessage(
        `同步${statusText}：获取 ${result.counts.fetched} 个，取消 Star ${result.counts.unstarred} 个。`,
      );

      if (result.status === "error") {
        const levelHint =
          result.errorLevel === "auth"
            ? "GitHub Token 可能已过期，请重新连接。"
            : result.errorLevel === "rate_limit"
              ? "GitHub API 已触发限流，请稍后重试。"
              : result.errorLevel === "network"
                ? "检测到网络问题，请重试。"
                : "未知同步问题。";
        setError(`${levelHint}${result.errorSummary ? ` (${result.errorSummary})` : ""}`);
      }
      refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "同步失败。");
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
          ? `详情请求失败：${caught.message}`
          : "详情请求失败：添加标签失败。",
      );
    } finally {
      setTagSubmitting(false);
    }
  }

  async function aiSearch() {
    if (aiSearching) return;

    const question = (queryDirty ? queryDraft : query).trim();

    if (!question) {
      setError("AI 搜索需要先输入问题。");
      return;
    }

    setAiSearching(true);
    setError(null);
    setSyncMessage(null);
    setAiSearchInsights([]);

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
      setContentMode("repos");
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
          ? `AI 搜索：${result.answer}`
          : "AI 搜索：未找到匹配仓库，请尝试更具体关键词。",
      );
      setAiSearchInsights(
        result.candidates
          .filter(
            (item): item is { id: string; fullName: string; reason: string; source?: string } =>
              typeof item.reason === "string" && item.reason.trim().length > 0,
          )
          .slice(0, 3)
          .map((item) => ({
            id: item.id,
            fullName: item.fullName,
            reason: item.reason,
            source: item.source ?? null,
          })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `AI 搜索失败：${caught.message}`
          : "AI 搜索失败。",
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
    setAiSearchInsights([]);
    setContentMode("repos");
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
          ? `详情请求失败：${caught.message}`
          : "详情请求失败：删除标签失败。",
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

    return "尚未同步";
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
  const showingSettingsPanel = contentMode !== "repos";

  let settingsPanelContent: React.ReactNode = null;

  if (contentMode === "general") {
    settingsPanelContent = <GeneralSettingsView />;
  } else if (contentMode === "providers") {
    settingsPanelContent = <AISettingsView />;
  } else if (contentMode === "tokens") {
    settingsPanelContent = <TokensSettingsView />;
  }

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
        syncing={syncing}
        onSyncNow={syncNow}
      />

      {error ? (
        <div className="workbench-banner workbench-banner--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="workbench-banner__close"
            aria-label="关闭错误提示"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {syncMessage ? (
        <div className="workbench-banner workbench-banner--info" role="status" aria-live="polite">
          <div className="workbench-banner__content">
            <span>{syncMessage}</span>
            {aiSearchInsights.length > 0 ? (
              <div className="workbench-banner__details">
                {aiSearchInsights.map((item) => (
                  <div key={item.id} className="workbench-banner__detail">
                    <strong>{item.fullName}</strong>
                    <span>{item.reason}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="workbench-banner__close"
            aria-label="关闭提示"
            onClick={() => {
              setSyncMessage(null);
              setAiSearchInsights([]);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div
        className={[
          "workbench-body",
          showingSettingsPanel ? "workbench-body--settings" : "",
          sidebarCollapsed ? "is-sidebar-collapsed" : "",
        ].filter(Boolean).join(" ")}
      >
        <WorkbenchSidebar
          contentMode={contentMode}
          favoritesOnly={favoritesOnly}
          aiSearchActive={aiSearchMode}
          onFavoritesClick={() => {
            setContentMode("repos");
            setAiSearchMode(false);
            setFavoritesOnly(true);
            setRecentMode(false);
            setPage(1);
          }}
          onAllStarsClick={() => {
            setContentMode("repos");
            setAiSearchMode(false);
            setFavoritesOnly(false);
            setRecentMode(false);
            setSort(DEFAULT_SEARCH_SORT);
            setPage(1);
          }}
          onRecentClick={() => {
            setContentMode("repos");
            setAiSearchMode(false);
            setFavoritesOnly(false);
            setRecentMode(true);
            setSort("recent");
            setPage(1);
          }}
          onOpenGeneral={() => setContentMode("general")}
          onOpenProviders={() => setContentMode("providers")}
          onOpenTokens={() => setContentMode("tokens")}
          recentActive={recentMode}
          total={allStarsTotal}
          favoriteCount={favoriteCount}
          lastSyncText={lastSyncText}
          syncStatusText={
            lastSync ? `${lastSync.counts.fetched} 个仓库 · ${lastSync.status === "success" ? "成功" : "失败"}` : `已追踪 ${allStarsTotal} 个仓库`
          }
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        {showingSettingsPanel ? (
          <section data-testid="workbench-settings-pane" className="workbench-settings-pane">
            {settingsPanelContent}
          </section>
        ) : (
          <>
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
              tagFilter={tagFilter}
              favoritesOnly={favoritesOnly}
              sort={displayedSort}
              onLanguageChange={(value) => {
                if (aiSearchMode) return;
                setLanguage(value);
                setPage(1);
              }}
              onTagFilterChange={(value) => {
                if (aiSearchMode) return;
                setTagFilter(value);
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
              noteSaveFeedback={noteSaveFeedback}
              onFavoriteToggle={async () => {
                if (!selectedRepo || favoriteUpdatingId) return;
                setFavoriteUpdatingId(selectedRepo.id);
                await updateRepo(selectedRepo.id, { isFavorite: !selectedRepo.isFavorite });
                setFavoriteUpdatingId(null);
              }}
              onNoteChange={(value) => {
                setNoteDraft(value);
                setNoteSaveFeedback(null);
                scheduleNoteSave(value);
              }}
              onSaveNote={() => void saveNoteNow()}
              onNewTagChange={setNewTag}
              onAddTag={addTag}
              onDeleteTag={deleteTag}
            />
          </>
        )}
      </div>
    </div>
  );
}
