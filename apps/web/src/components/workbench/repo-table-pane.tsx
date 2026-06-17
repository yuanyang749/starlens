"use client";

import type { RepoSummary, SearchSort } from "@starlens-app/core";
import { ArrowDownUp, Star, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RepoTableRow } from "./repo-table-row";

type RepoTablePaneProps = {
  repos: RepoSummary[];
  total: number;
  mode: "default" | "ai_search";
  page: number;
  pageSize: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  syncNow: () => void;
  syncing: boolean;
  language: string;
  tagFilter: string;
  favoritesOnly: boolean;
  sort: SearchSort;
  onLanguageChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  onFavoritesToggle: () => void;
  onClearFilters: () => void;
  onResetSort: () => void;
  onSortChange: (value: SearchSort) => void;
  onPageChange: (page: number) => void;
  onFavoriteToggleRepo: (repo: RepoSummary) => Promise<void>;
  favoriteUpdatingId: string | null;
};

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  for (const page of sorted) {
    const last = items[items.length - 1];
    if (typeof last === "number" && page - last > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}

export function RepoTablePane({
  repos,
  total,
  mode,
  page,
  pageSize,
  selectedId,
  onSelect,
  syncNow,
  syncing,
  language,
  tagFilter,
  favoritesOnly,
  sort,
  onLanguageChange,
  onTagFilterChange,
  onFavoritesToggle,
  onClearFilters,
  onResetSort,
  onSortChange,
  onPageChange,
  onFavoriteToggleRepo,
  favoriteUpdatingId,
}: RepoTablePaneProps) {
  const isAiSearchMode = mode === "ai_search";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageItems = buildPaginationItems(safePage, totalPages);
  const pageStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(safePage * pageSize, total);

  return (
    <section data-testid="repo-table-pane" className="repo-table-pane">
      <div className="repo-table-pane__filters">
        <div className="repo-table-pane__filters-main">
          <label className="workbench-input-shell repo-table-pane__filter-field">
            <input
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              aria-label="按语言筛选"
              placeholder="语言"
              className="workbench-input"
              disabled={isAiSearchMode}
            />
            {language ? (
              <button
                type="button"
                className="workbench-input-clear"
                aria-label="清空语言筛选"
                onClick={() => onLanguageChange("")}
                disabled={isAiSearchMode}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <label className="workbench-input-shell repo-table-pane__filter-field">
            <input
              value={tagFilter}
              onChange={(event) => onTagFilterChange(event.target.value)}
              aria-label="按标签筛选"
              placeholder="标签"
              className="workbench-input"
              disabled={isAiSearchMode}
            />
            {tagFilter ? (
              <button
                type="button"
                className="workbench-input-clear"
                aria-label="清空标签筛选"
                onClick={() => onTagFilterChange("")}
                disabled={isAiSearchMode}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as SearchSort)}
            disabled={isAiSearchMode}
          >
            <SelectTrigger className="workbench-select-trigger repo-table-pane__sort-trigger" aria-label="仓库排序">
              <SelectValue placeholder="仓库排序" />
            </SelectTrigger>
            <SelectContent className="workbench-select-content" position="popper">
              <SelectItem value="updated">最近更新</SelectItem>
              <SelectItem value="recent">最近同步</SelectItem>
              <SelectItem value="stars">Stars</SelectItem>
              <SelectItem value="relevance">相关度</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={onFavoritesToggle}
            className={favoritesOnly ? "workbench-button workbench-button--active" : "workbench-button workbench-button--ghost"}
            disabled={isAiSearchMode}
          >
            <Star className="h-4 w-4" />
            重点收藏
          </button>
        </div>
        <div className="repo-table-pane__filters-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClearFilters}
                className="workbench-icon-button workbench-icon-button--round"
                aria-label="清空筛选"
                disabled={isAiSearchMode}
              >
                <X className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>清空筛选</span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onResetSort}
                className="workbench-icon-button workbench-icon-button--round"
                aria-label="重置排序"
                disabled={isAiSearchMode}
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>重置排序</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="repo-table-pane__header">
        <span>仓库</span>
        <span>Stars</span>
        <span>语言</span>
        <span>更新</span>
        <span>标签</span>
        <span>操作</span>
      </div>

      <div className="repo-table-pane__body">
        {repos.map((repo) => (
          <RepoTableRow
            key={repo.id}
            repo={repo}
            selected={repo.id === selectedId}
            onSelect={() => onSelect(repo.id)}
            onToggleFavorite={onFavoriteToggleRepo}
            favoriteUpdating={favoriteUpdatingId === repo.id}
          />
        ))}
        {repos.length === 0 ? (
          <div className="repo-table-empty">
            {isAiSearchMode ? (
              <>
                <p className="repo-table-empty__title">还没有 AI 匹配结果。</p>
                <p className="repo-table-empty__body">
                  换一个更具体的问题，再用 AI 搜索查看按相关度排序的仓库。
                </p>
              </>
            ) : (
              <>
                <p className="repo-table-empty__title">还没有同步仓库。</p>
                <p className="repo-table-empty__body">
                  先同步一次 GitHub Stars，导入公开星标仓库。
                </p>
                <button
                  type="button"
                  onClick={syncNow}
                  disabled={syncing}
                  className="workbench-button workbench-button--primary"
                >
                  {syncing ? "同步中" : "开始首次同步"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="repo-table-pane__footer">
        <p>{repos.length === 0 ? "0" : `${pageStart}-${pageEnd}`} / {total} 个仓库</p>
        <div className="repo-table-pagination">
          <button
            type="button"
            className={safePage <= 1 ? "repo-page-chip repo-page-chip--ghost" : "repo-page-chip"}
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
          >
            上一页
          </button>
          {pageItems.map((item, index) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="repo-page-chip repo-page-chip--ghost">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={item === safePage ? "repo-page-chip is-active" : "repo-page-chip"}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={safePage >= totalPages ? "repo-page-chip repo-page-chip--ghost" : "repo-page-chip"}
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  );
}
