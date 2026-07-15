// Workbench 数据层 hook
// 职责：列表请求、详情请求、同步、仓库更新等核心数据逻辑

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PaginatedResult, RepoSummary } from "@starlens-app/core";
import { type SyncResult, apiJson } from "./workbench-api";
import { formatDateTime } from "./workbench-formatters";

export type WorkbenchQueryState = {
  searchParams: URLSearchParams;
  favoritesOnly: boolean;
  query: string;
  language: string;
  tagFilter: string;
};

export function useWorkbenchData(
  queryState: WorkbenchQueryState,
  selectedId: string | null,
  setSelectedId: Dispatch<SetStateAction<string | null>>,
  aiSearchMode: boolean,
) {
  const { searchParams, favoritesOnly, query, language, tagFilter } = queryState;

  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [allStarsTotal, setAllStarsTotal] = useState(0);
  const [favoritesTotal, setFavoritesTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<RepoSummary[]>([]);

  const hasAutoSyncedRef = useRef(false);
  const syncNowRef = useRef<() => Promise<void>>(async () => {});

  // 中文注释：fetchList 是纯请求逻辑，不设置 loading 状态。
  // 这样 effect 调用时不会触发 set-state-in-effect 警告（stale-while-revalidate 模式）。
  // 外部调用（syncNow、手动搜索）通过 refreshList 包装层显式设置 loading=true。
  const fetchList = useCallback(
    (signal: AbortSignal) => {
      return apiJson<PaginatedResult<RepoSummary>>(
        `/api/search?${searchParams.toString()}`,
        { signal },
      )
        .then((data) => {
          setRepos(data.items);
          setTotal(data.total);
          if (typeof data.allStarsTotal === "number") {
            setAllStarsTotal(data.allStarsTotal);
          } else if (!favoritesOnly && !aiSearchMode && !query.trim() && !language && !tagFilter) {
            setAllStarsTotal(data.total);
          }

          if (typeof data.favoritesTotal === "number") {
            setFavoritesTotal(data.favoritesTotal);
          } else if (favoritesOnly && !aiSearchMode && !query.trim() && !language && !tagFilter) {
            setFavoritesTotal(data.total);
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
          setLoading(false);
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
          setLoading(false);
        });
    },
    [aiSearchMode, favoritesOnly, language, query, searchParams, setSelectedId, tagFilter],
  );

  const refreshList = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchList(controller.signal);
    return controller;
  }, [fetchList]);

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
    const controller = new AbortController();
    void fetchList(controller.signal);
    return () => controller.abort();
  }, [fetchList]);

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

      if (typeof updates.isFavorite === "boolean" && updates.isFavorite !== currentRepo.isFavorite) {
        setFavoritesTotal((prev) => (updates.isFavorite ? prev + 1 : Math.max(0, prev - 1)));
      }

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
        if (typeof updates.isFavorite === "boolean" && updates.isFavorite !== currentRepo.isFavorite) {
          setFavoritesTotal((prev) => (currentRepo.isFavorite ? prev + 1 : Math.max(0, prev - 1)));
        }
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

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);

    try {
      let result: SyncResult;
      do {
        result = await apiJson<SyncResult>("/api/sync", { method: "POST" });
        setLastSync(result);

        if (result.status === "running") {
          setSyncMessage(
            `正在同步第 ${result.pageCount} 页：已导入 ${result.counts.insertedOrUpdated} 个仓库，可以先浏览已导入内容。`,
          );
          // 每完成一页就更新列表，首次同步不再等所有 Star 与 README 都处理完才可用。
          refreshList();
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, result.continuation.nextRequestAfterMs ?? 150);
          });
        }
      } while (result.status === "running");

      const statusText = result.status === "success" ? "完成" : "失败";
      setSyncMessage(`同步${statusText}：获取 ${result.counts.fetched} 个，取消 Star ${result.counts.unstarred} 个。`);

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
  }, [refreshList]);

  // 中文注释：保持 syncNowRef 指向最新的 syncNow，供自动同步 effect 调用。
  // 在 useEffect 中更新 ref 而非 render 阶段，符合 React 19 并发渲染要求。
  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  // 中文注释：首次登录若仓库为空（无筛选条件），自动触发一次同步。
  useEffect(() => {
    if (loading) return;
    if (hasAutoSyncedRef.current) return;
    if (total > 0 || aiSearchMode) return;
    if (query.trim() || language || tagFilter || favoritesOnly) return;
    hasAutoSyncedRef.current = true;
    void syncNowRef.current();
  }, [loading, total, aiSearchMode, query, language, tagFilter, favoritesOnly]);

  const lastSyncText = (() => {
    if (lastSync) {
      return formatDateTime(lastSync.finishedAt ?? lastSync.startedAt);
    }
    if (selectedRepo) {
      return formatDateTime(selectedRepo.lastSyncedAt);
    }
    if (repos[0]) {
      return formatDateTime(repos[0].lastSyncedAt);
    }
    return "尚未同步";
  })();

  const favoriteCount = favoritesTotal;

  return {
    // 列表数据
    repos,
    loading,
    total,
    allStarsTotal,
    pageSize,
    refreshList,
    // 详情数据
    selectedRepo,
    setSelectedRepo,
    noteDraft,
    setNoteDraft,
    // 同步
    lastSync,
    syncing,
    syncNow,
    syncMessage,
    setSyncMessage,
    lastSyncText,
    // 错误
    error,
    setError,
    // AI 搜索结果
    aiSearchResults,
    setAiSearchResults,
    // 仓库更新
    updateRepo,
    patchRepoInList,
    // 统计
    favoriteCount,
  };
}

export type WorkbenchData = ReturnType<typeof useWorkbenchData>;
