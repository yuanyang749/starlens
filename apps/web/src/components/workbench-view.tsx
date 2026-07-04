"use client";

import { useMemo, useState } from "react";
import { DEFAULT_SEARCH_SORT, type RepoSummary } from "@starlens-app/core";
import { X } from "lucide-react";
import { AISettingsView } from "./ai-settings-view";
import { GeneralSettingsView } from "./general-settings-view";
import { RepoDetailPanel } from "./workbench/repo-detail-panel";
import { RepoTablePane } from "./workbench/repo-table-pane";
import { useWorkbenchQueryState } from "./workbench/use-workbench-query-state";
import { WorkbenchSidebar } from "./workbench/workbench-sidebar";
import { WorkbenchTopbar } from "./workbench/workbench-topbar";
import { TokensSettingsView } from "./tokens-settings-view";
import { AdminUsersView } from "./admin-users-view";
import { DashboardView } from "./workbench/dashboard-view";
import { AiSearchReport } from "./workbench/ai-search-report";
import { useWorkbenchData } from "./workbench/use-workbench-data";
import { useWorkbenchActions } from "./workbench/use-workbench-actions";

export function WorkbenchView({
  userName = "GitHub 用户",
  userAvatarUrl = null,
  isAdmin = false,
}: {
  userName?: string;
  userAvatarUrl?: string | null;
  isAdmin?: boolean;
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

  // 内容模式与侧边栏状态（纯 UI，不属于数据层或动作层）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 中文注释：默认进入 "repos" 模式,保证 RepoTablePane / RepoDetailPanel 立即可见,
  // 也是 workbench-view.test.tsx 的契约(11 个用例依赖此默认值)。DashboardView 通过侧边栏导航进入。
  const [contentMode, setContentMode] = useState<"repos" | "general" | "providers" | "tokens" | "admin" | "dashboard">("repos");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [recentMode, setRecentMode] = useState(false);

  // 数据层
  const data = useWorkbenchData(
    { searchParams, favoritesOnly, query, language, tagFilter },
    selectedId,
    setSelectedId,
    aiSearchMode,
  );

  // 交互动作层
  const actions = useWorkbenchActions({
    data,
    query,
    setQuery,
    page,
    setPage,
    clearFilters,
    setContentMode,
    setAiSearchMode,
    setFavoritesOnly,
    setRecentMode,
    setSort,
    setSelectedId,
    aiSearchMode,
    recentMode,
  });

  const {
    repos,
    loading,
    total,
    allStarsTotal,
    pageSize,
    selectedRepo,
    noteDraft,
    error,
    syncing,
    syncNow,
    syncMessage,
    setSyncMessage,
    lastSync,
    lastSyncText,
    favoriteCount,
    aiSearchResults,
  } = data;

  const {
    noteSaveFeedback,
    setNoteSaveFeedback,
    scheduleNoteSave,
    saveNoteNow,
    newTag,
    setNewTag,
    addTag,
    deleteTag,
    tagSubmitting,
    tagDeleting,
    favoriteUpdatingId,
    toggleFavorite,
    toggleSelectedFavorite,
    aiSearching,
    aiSearchInsights,
    setAiSearchInsights,
    aiSearch,
    queryDraft,
    queryDirty,
    submitSearch,
    updateQueryDraft,
    clearFiltersAndDraft,
  } = actions;

  // AI 搜索分页
  const aiSearchPageSize = Math.max(1, pageSize);
  const aiSearchTotal = aiSearchResults.length;
  const aiSearchPagedRepos = useMemo(() => {
    const start = (page - 1) * aiSearchPageSize;
    return aiSearchResults.slice(start, start + aiSearchPageSize);
  }, [aiSearchPageSize, aiSearchResults, page]);

  const displayedRepos = aiSearchMode ? aiSearchPagedRepos : repos;
  const displayedTotal = aiSearchMode ? aiSearchTotal : total;
  const displayedSort = aiSearchMode ? "relevance" : sort;
  const showingSettingsPanel = contentMode !== "repos" && contentMode !== "dashboard";

  let settingsPanelContent: React.ReactNode = null;

  if (contentMode === "general") {
    settingsPanelContent = <GeneralSettingsView />;
  } else if (contentMode === "providers") {
    settingsPanelContent = <AISettingsView isAdmin={isAdmin} />;
  } else if (contentMode === "tokens") {
    settingsPanelContent = <TokensSettingsView />;
  } else if (contentMode === "admin") {
    settingsPanelContent = <AdminUsersView />;
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
            onClick={() => data.setError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {syncMessage && aiSearchInsights.length === 0 ? (
        <div className="workbench-banner workbench-banner--info" role="status" aria-live="polite">
          <div className="workbench-banner__content">
            <span>{syncMessage}</span>
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
          isAdmin={isAdmin}
          onOpenAdmin={() => setContentMode("admin")}
          onOpenDashboard={() => setContentMode("dashboard")}
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
        ) : contentMode === "dashboard" ? (
          <section className="workbench-settings-pane">
            <DashboardView />
          </section>
        ) : (
          <div className="workbench-content-container">
            {syncMessage && aiSearchInsights.length > 0 ? (
              <AiSearchReport
                summaryText={syncMessage.replace(/^AI 搜索：/, "")}
                insights={aiSearchInsights}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onClose={() => {
                  setSyncMessage(null);
                  setAiSearchInsights([]);
                }}
              />
            ) : null}

            <div className="workbench-repos-grid">
              <RepoTablePane
                repos={displayedRepos}
                total={displayedTotal}
                allStarsTotal={allStarsTotal}
                loading={loading}
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
                onFavoriteToggleRepo={async (repo: RepoSummary) => {
                  await toggleFavorite(repo);
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
                onFavoriteToggle={toggleSelectedFavorite}
                onNoteChange={(value) => {
                  data.setNoteDraft(value);
                  setNoteSaveFeedback(null);
                  scheduleNoteSave(value);
                }}
                onSaveNote={() => void saveNoteNow()}
                onNewTagChange={setNewTag}
                onAddTag={addTag}
                onDeleteTag={deleteTag}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
