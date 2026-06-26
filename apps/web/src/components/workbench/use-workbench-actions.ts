// Workbench 交互动作 hook
// 职责：收藏、备注、标签、AI 搜索等交互逻辑

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoSummary, SearchSort } from "@starlens-app/core";
import {
  type AiAskResult,
  type AiSearchInsight,
  apiJson,
} from "./workbench-api";
import type { WorkbenchData } from "./use-workbench-data";

export type WorkbenchActionsDeps = {
  data: WorkbenchData;
  // 查询状态
  query: string;
  setQuery: (q: string) => void;
  page: number;
  setPage: (p: number) => void;
  clearFilters: () => void;
  // 内容模式控制
  setContentMode: (mode: "repos" | "general" | "providers" | "tokens" | "admin" | "dashboard") => void;
  setAiSearchMode: (mode: boolean) => void;
  setFavoritesOnly: (f: boolean) => void;
  setRecentMode: (r: boolean) => void;
  setSort: (s: SearchSort) => void;
  setSelectedId: (id: string | null) => void;
  // 模式状态（用于 submitSearch 的刷新判断）
  aiSearchMode: boolean;
  recentMode: boolean;
};

export function useWorkbenchActions(deps: WorkbenchActionsDeps) {
  const { data } = deps;
  const {
    selectedRepo,
    noteDraft,
    updateRepo,
    patchRepoInList,
    setError,
    setSyncMessage,
    refreshList,
  } = data;

  const [noteSaveFeedback, setNoteSaveFeedback] = useState<string | null>(null);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState<string | null>(null);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [queryDraft, setQueryDraft] = useState(deps.query);
  const [queryDirty, setQueryDirty] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchInsights, setAiSearchInsights] = useState<AiSearchInsight[]>([]);

  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

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

  async function addTag() {
    if (!selectedRepo || !newTag.trim() || tagSubmitting) return;

    const tag = newTag.trim().toLowerCase();
    if (selectedRepo.tags.includes(tag)) return;

    setTagSubmitting(true);
    const prevRepo = selectedRepo;
    const optimisticRepo = { ...selectedRepo, tags: [...selectedRepo.tags, tag] };
    data.setSelectedRepo(optimisticRepo);
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
      data.setSelectedRepo(prevRepo);
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

  async function deleteTag(tag: string) {
    if (!selectedRepo || tagDeleting) return;

    setTagDeleting(tag);
    const prevRepo = selectedRepo;
    const optimisticRepo = {
      ...selectedRepo,
      tags: selectedRepo.tags.filter((item) => item !== tag),
    };
    data.setSelectedRepo(optimisticRepo);
    patchRepoInList(optimisticRepo);

    try {
      await apiJson<{ tags: string[] }>(
        `/api/repos/${selectedRepo.id}/tags/${encodeURIComponent(tag)}`,
        { method: "DELETE" },
      );
      setError(null);
    } catch (caught) {
      data.setSelectedRepo(prevRepo);
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

  async function aiSearch() {
    if (aiSearching) return;

    const question = (queryDirty ? queryDraft : deps.query).trim();

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

      data.setAiSearchResults(aiRepos);
      deps.setContentMode("repos");
      deps.setAiSearchMode(true);
      deps.setFavoritesOnly(false);
      deps.setRecentMode(false);
      deps.setPage(1);

      const firstCandidate = aiRepos[0];
      if (firstCandidate?.id) {
        deps.setSelectedId(firstCandidate.id);
      } else {
        deps.setSelectedId(null);
      }

      setSyncMessage(
        aiRepos.length > 0
          ? `AI 搜索：${result.answer}`
          : "AI 搜索：未找到匹配仓库，请尝试更具体关键词。",
      );
      setAiSearchInsights(
        result.candidates
          .filter(
            (item): item is { id: string; fullName: string; reason: string; source?: string; score?: number } =>
              typeof item.reason === "string" && item.reason.trim().length > 0,
          )
          .slice(0, 3)
          .map((item) => ({
            id: item.id,
            fullName: item.fullName,
            reason: item.reason,
            source: item.source ?? null,
            score: item.score,
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
    const nextQuery = (queryDirty ? queryDraft : deps.query).trim();

    if (!nextQuery) {
      return;
    }

    setError(null);
    setSyncMessage(null);
    setAiSearchInsights([]);
    deps.setContentMode("repos");
    deps.setAiSearchMode(false);
    deps.setRecentMode(false);

    const shouldRefreshImmediately =
      nextQuery === deps.query.trim() && deps.page === 1 && !deps.aiSearchMode && !deps.recentMode;

    deps.setQuery(nextQuery);
    setQueryDraft(nextQuery);
    setQueryDirty(false);
    deps.setPage(1);

    if (shouldRefreshImmediately) {
      refreshList();
    }
  }

  function updateQueryDraft(value: string) {
    setQueryDraft(value);
    setQueryDirty(true);
  }

  function clearFiltersAndDraft() {
    deps.clearFilters();
    setQueryDraft("");
    setQueryDirty(false);
  }

  const toggleFavorite = useCallback(async (repo: RepoSummary) => {
    if (favoriteUpdatingId) return;
    setFavoriteUpdatingId(repo.id);
    await updateRepo(repo.id, { isFavorite: !repo.isFavorite });
    setFavoriteUpdatingId(null);
  }, [favoriteUpdatingId, updateRepo]);

  const toggleSelectedFavorite = useCallback(async () => {
    if (!selectedRepo || favoriteUpdatingId) return;
    setFavoriteUpdatingId(selectedRepo.id);
    await updateRepo(selectedRepo.id, { isFavorite: !selectedRepo.isFavorite });
    setFavoriteUpdatingId(null);
  }, [favoriteUpdatingId, selectedRepo, updateRepo]);

  return {
    // 备注相关
    noteSaveFeedback,
    setNoteSaveFeedback,
    scheduleNoteSave,
    saveNoteNow,
    // 标签相关
    newTag,
    setNewTag,
    addTag,
    deleteTag,
    tagSubmitting,
    tagDeleting,
    // 收藏相关
    favoriteUpdatingId,
    toggleFavorite,
    toggleSelectedFavorite,
    // AI 搜索相关
    aiSearching,
    aiSearchInsights,
    setAiSearchInsights,
    aiSearch,
    // 查询相关
    queryDraft,
    queryDirty,
    submitSearch,
    updateQueryDraft,
    clearFiltersAndDraft,
  };
}

export type WorkbenchActions = ReturnType<typeof useWorkbenchActions>;
