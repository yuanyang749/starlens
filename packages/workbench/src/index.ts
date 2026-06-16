"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SEARCH_SORT,
  type AiConfig,
  type PaginatedResult,
  type RepoSummary,
  type SearchSort,
  type TokenRecord,
} from "@starlens/core";

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type SyncResult = {
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

export type AiAskResult = {
  answer: string;
  candidates: Array<{
    id: string;
    fullName: string;
    reason?: string;
    source?: string;
  }>;
  providerConfigId: string | null;
  providerConfigSource?: "user_default" | "system_default" | "none";
};

export type WorkbenchMode = "all" | "favorites" | "recent" | "settings";

export type SettingsSection = "general" | "providers" | "tokens";

// 中文注释：显式声明共享 hook 的公共返回类型，避免干净 Docker 构建时跨包推断退化为 any。
export type MobileWorkbenchState = {
  mode: WorkbenchMode;
  settingsSection: SettingsSection;
  queryDraft: string;
  submittedQuery: string;
  language: string;
  tagFilter: string;
  sort: SearchSort;
  page: number;
  pageSize: number;
  repos: RepoSummary[];
  total: number;
  totalPages: number;
  selectedId: string | null;
  selectedRepo: RepoSummary | null;
  noteDraft: string;
  newTag: string;
  error: string | null;
  message: string | null;
  lastSync: SyncResult | null;
  syncing: boolean;
  loadingRepos: boolean;
  loadingMore: boolean;
  aiSearching: boolean;
  aiSearchMode: boolean;
  hasMore: boolean;
  favoriteUpdatingId: string | null;
  tagSubmitting: boolean;
  tagDeleting: string | null;
  providers: AiConfig[];
  tokens: TokenRecord[];
  actions: {
    setMode: (value: WorkbenchMode) => void;
    setSettingsSection: (value: SettingsSection) => void;
    setQueryDraft: (value: string) => void;
    submitSearch: () => void;
    aiSearch: () => Promise<void>;
    syncNow: () => Promise<void>;
    setLanguage: (value: string) => void;
    setTagFilter: (value: string) => void;
    setSort: (value: SearchSort) => void;
    setPage: (value: number) => void;
    loadMore: () => Promise<void>;
    clearFilters: () => void;
    setSelectedId: (value: string | null) => void;
    setError: (value: string | null) => void;
    setMessage: (value: string | null) => void;
    toggleFavorite: (repo: RepoSummary) => Promise<void>;
    changeNote: (value: string) => void;
    saveNoteNow: () => Promise<void>;
    setNewTag: (value: string) => void;
    addTag: () => Promise<void>;
    deleteTag: (tag: string) => Promise<void>;
    loadSettings: () => Promise<void>;
  };
};

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "unknown_error", status = 500) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function fetchApi<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!payload || payload.ok !== true) {
    const message = payload?.error?.message ?? `请求失败，状态码 ${response.status}`;
    const code = payload?.error?.code ?? "invalid_api_response";
    throw new ApiClientError(message, code, response.status);
  }

  return payload.data;
}

function buildSearchParams(input: {
  query: string;
  mode: WorkbenchMode;
  page: number;
  pageSize: number;
  language: string;
  tagFilter: string;
  sort: SearchSort;
}) {
  const params = new URLSearchParams();
  if (input.query.trim()) params.set("q", input.query.trim());
  if (input.language.trim()) params.set("language", input.language.trim());
  if (input.tagFilter.trim()) params.set("tag", input.tagFilter.trim());
  if (input.mode === "favorites") params.set("favorite", "true");
  params.set("sort", input.mode === "recent" ? "recent" : input.sort);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));
  return params;
}

export function useMobileWorkbench(): MobileWorkbenchState {
  const [mode, setMode] = useState<WorkbenchMode>("all");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [queryDraft, setQueryDraft] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<SearchSort>(DEFAULT_SEARCH_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<RepoSummary[]>([]);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState<string | null>(null);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);
  const [providers, setProviders] = useState<AiConfig[]>([]);
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchParamsInput = useMemo(() => ({
    query: submittedQuery,
    mode,
    pageSize,
    language,
    tagFilter,
    sort,
  }), [language, mode, pageSize, sort, submittedQuery, tagFilter]);

  const displayedRepos = aiSearchMode ? aiSearchResults.slice(0, page * pageSize) : repos;
  const displayedTotal = aiSearchMode ? aiSearchResults.length : total;
  const totalPages = Math.max(1, Math.ceil(displayedTotal / pageSize));
  const hasMore = page < totalPages;

  const patchRepoInList = useCallback((repo: RepoSummary) => {
    setRepos((items) => items.map((item) => (item.id === repo.id ? { ...item, ...repo } : item)));
    setAiSearchResults((items) => items.map((item) => (item.id === repo.id ? { ...item, ...repo } : item)));
    setSelectedRepo((current) => (current?.id === repo.id ? { ...current, ...repo } : current));
  }, []);

  const fetchSearchPage = useCallback((pageToLoad: number, signal?: AbortSignal) => {
    const params = buildSearchParams({ ...searchParamsInput, page: pageToLoad });
    return fetchApi<PaginatedResult<RepoSummary>>(`/api/search?${params.toString()}`, { signal });
  }, [searchParamsInput]);

  const refreshList = useCallback((signal?: AbortSignal) => {
    setLoadingRepos(true);
    return fetchSearchPage(1, signal)
      .then((data) => {
        setRepos(data.items);
        setTotal(data.total);
        setPage(data.page);
        setPageSize(data.pageSize);
        setError(null);
        setSelectedId((current) =>
          data.items.some((repo) => repo.id === current) ? current : data.items[0]?.id ?? null,
        );
        if (data.items.length === 0) {
          setSelectedRepo(null);
          setNoteDraft("");
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "搜索失败。");
      })
      .finally(() => setLoadingRepos(false));
  }, [fetchSearchPage]);

  const loadMore = useCallback(async () => {
    if (mode === "settings" || loadingRepos || loadingMore || !hasMore) return;

    if (aiSearchMode) {
      setPage((current) => Math.min(current + 1, totalPages));
      return;
    }

    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchSearchPage(nextPage);
      setRepos((items) => {
        const seen = new Set(items.map((item) => item.id));
        const nextItems = data.items.filter((item) => !seen.has(item.id));
        return [...items, ...nextItems];
      });
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.pageSize);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载更多失败。");
    } finally {
      setLoadingMore(false);
    }
  }, [aiSearchMode, fetchSearchPage, hasMore, loadingMore, loadingRepos, mode, page, totalPages]);

  useEffect(() => {
    if (mode === "settings" || aiSearchMode) return;
    const controller = new AbortController();
    void refreshList(controller.signal);
    return () => controller.abort();
  }, [aiSearchMode, mode, refreshList]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetchApi<RepoSummary>(`/api/repos/${selectedId}`, { signal: controller.signal })
      .then((repo) => {
        setSelectedRepo(repo);
        setNoteDraft(repo.note);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "详情加载失败。");
      });
    return () => controller.abort();
  }, [selectedId]);

  const submitSearch = useCallback(() => {
    const nextQuery = queryDraft.trim();
    if (!nextQuery) return;
    setMode("all");
    setAiSearchMode(false);
    setSubmittedQuery(nextQuery);
    setPage(1);
    setMessage(null);
    setError(null);
  }, [queryDraft]);

  const clearFilters = useCallback(() => {
    setQueryDraft("");
    setSubmittedQuery("");
    setLanguage("");
    setTagFilter("");
    setSort(DEFAULT_SEARCH_SORT);
    setPage(1);
    setAiSearchMode(false);
  }, []);

  const selectMode = useCallback((nextMode: WorkbenchMode) => {
    setMode(nextMode);
    setPage(1);
    if (nextMode !== "settings") {
      setAiSearchMode(false);
    }
    if (nextMode === "recent") setSort("recent");
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const result = await fetchApi<SyncResult>("/api/sync", { method: "POST" });
      setLastSync(result);
      setMessage(`同步${result.status === "success" ? "完成" : "失败"}：获取 ${result.counts.fetched} 个。`);
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "同步失败。");
    } finally {
      setSyncing(false);
    }
  }, [refreshList]);

  const aiSearch = useCallback(async () => {
    const question = queryDraft.trim();
    if (!question || aiSearching) return;
    setAiSearching(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchApi<AiAskResult>("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const reposFromAi = await Promise.all(result.candidates.map((item) => fetchApi<RepoSummary>(`/api/repos/${item.id}`)));
      setAiSearchResults(reposFromAi);
      setAiSearchMode(true);
      setMode("all");
      setPage(1);
      setSelectedId(reposFromAi[0]?.id ?? null);
      setMessage(reposFromAi.length > 0 ? `AI 搜索：${result.answer}` : "AI 搜索未找到匹配仓库。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 搜索失败。");
    } finally {
      setAiSearching(false);
    }
  }, [aiSearching, queryDraft]);

  const updateRepo = useCallback(async (repoId: string, updates: { isFavorite?: boolean; note?: string }) => {
    const current = selectedRepo?.id === repoId
      ? selectedRepo
      : repos.find((item) => item.id === repoId) ?? aiSearchResults.find((item) => item.id === repoId);
    if (!current) return false;

    const optimistic = { ...current, ...updates };
    patchRepoInList(optimistic);
    try {
      const repo = await fetchApi<RepoSummary>(`/api/repos/${repoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      patchRepoInList(repo);
      setError(null);
      return true;
    } catch (caught) {
      patchRepoInList(current);
      setError(caught instanceof Error ? caught.message : "更新失败。");
      return false;
    }
  }, [aiSearchResults, patchRepoInList, repos, selectedRepo]);

  const toggleFavorite = useCallback(async (repo: RepoSummary) => {
    if (favoriteUpdatingId) return;
    setFavoriteUpdatingId(repo.id);
    await updateRepo(repo.id, { isFavorite: !repo.isFavorite });
    setFavoriteUpdatingId(null);
  }, [favoriteUpdatingId, updateRepo]);

  const changeNote = useCallback((value: string) => {
    setNoteDraft(value);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    noteDebounceRef.current = setTimeout(() => {
      if (selectedRepo) void updateRepo(selectedRepo.id, { note: value });
    }, 600);
  }, [selectedRepo, updateRepo]);

  const saveNoteNow = useCallback(async () => {
    if (!selectedRepo) return;
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    const saved = await updateRepo(selectedRepo.id, { note: noteDraft });
    if (saved) setMessage("备注已保存。");
  }, [noteDraft, selectedRepo, updateRepo]);

  const addTag = useCallback(async () => {
    if (!selectedRepo || !newTag.trim() || tagSubmitting) return;
    const tag = newTag.trim().toLowerCase();
    setTagSubmitting(true);
    try {
      await fetchApi<{ tags: string[] }>(`/api/repos/${selectedRepo.id}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      const repo = await fetchApi<RepoSummary>(`/api/repos/${selectedRepo.id}`);
      patchRepoInList(repo);
      setNewTag("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加标签失败。");
    } finally {
      setTagSubmitting(false);
    }
  }, [newTag, patchRepoInList, selectedRepo, tagSubmitting]);

  const deleteTag = useCallback(async (tag: string) => {
    if (!selectedRepo || tagDeleting) return;
    setTagDeleting(tag);
    try {
      await fetchApi<{ tags: string[] }>(`/api/repos/${selectedRepo.id}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });
      const repo = await fetchApi<RepoSummary>(`/api/repos/${selectedRepo.id}`);
      patchRepoInList(repo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除标签失败。");
    } finally {
      setTagDeleting(null);
    }
  }, [patchRepoInList, selectedRepo, tagDeleting]);

  const loadSettings = useCallback(async () => {
    try {
      const [nextProviders, nextTokens] = await Promise.all([
        fetchApi<AiConfig[]>("/api/ai/configs"),
        fetchApi<TokenRecord[]>("/api/tokens"),
      ]);
      setProviders(nextProviders);
      setTokens(nextTokens);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置加载失败。");
    }
  }, []);

  useEffect(() => {
    if (mode === "settings") void loadSettings();
  }, [loadSettings, mode]);

  useEffect(() => () => {
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
  }, []);

  return {
    mode,
    settingsSection,
    queryDraft,
    submittedQuery,
    language,
    tagFilter,
    sort,
    page,
    pageSize,
    repos: displayedRepos,
    total: displayedTotal,
    totalPages,
    selectedId,
    selectedRepo,
    noteDraft,
    newTag,
    error,
    message,
    lastSync,
    syncing,
    loadingRepos,
    loadingMore,
    aiSearching,
    aiSearchMode,
    hasMore,
    favoriteUpdatingId,
    tagSubmitting,
    tagDeleting,
    providers,
    tokens,
    actions: {
      setMode: selectMode,
      setSettingsSection,
      setQueryDraft,
      submitSearch,
      aiSearch,
      syncNow,
      setLanguage,
      setTagFilter,
      setSort,
      setPage,
      loadMore,
      clearFilters,
      setSelectedId,
      setError,
      setMessage,
      toggleFavorite,
      changeNote,
      saveNoteNow,
      setNewTag,
      addTag,
      deleteTag,
      loadSettings,
    },
  };
}
