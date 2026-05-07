"use client";

import type { RepoSummary, SearchSort } from "@starlens/core";
import { Search, Star, X } from "lucide-react";
import { RepoTableRow } from "./repo-table-row";

type RepoTablePaneProps = {
  repos: RepoSummary[];
  total: number;
  page: number;
  pageSize: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  syncNow: () => void;
  syncing: boolean;
  language: string;
  owner: string;
  tagFilter: string;
  favoritesOnly: boolean;
  sort: SearchSort;
  onLanguageChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  onFavoritesToggle: () => void;
  onClearFilters: () => void;
  onResetSort: () => void;
  onSortChange: (value: SearchSort) => void;
  onPageChange: (page: number) => void;
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
  page,
  pageSize,
  selectedId,
  onSelect,
  syncNow,
  syncing,
  language,
  owner,
  tagFilter,
  favoritesOnly,
  sort,
  onLanguageChange,
  onOwnerChange,
  onTagFilterChange,
  onFavoritesToggle,
  onClearFilters,
  onResetSort,
  onSortChange,
  onPageChange,
}: RepoTablePaneProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageItems = buildPaginationItems(safePage, totalPages);
  const pageStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(safePage * pageSize, total);

  return (
    <section data-testid="repo-table-pane" className="repo-table-pane">
      <div className="repo-table-pane__toolbar">
        <button type="button" className="workbench-checkbox" aria-label="Bulk selection disabled" />
        <label className="repo-table-filter">
          <Search className="h-4 w-4" />
          <input
            aria-label="Filter repositories"
            value={owner}
            onChange={(event) => onOwnerChange(event.target.value)}
            placeholder="Filter repositories..."
          />
        </label>
      </div>

      <div className="repo-table-pane__filters">
        <input
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
          placeholder="Language"
          className="workbench-input"
        />
        <input
          value={tagFilter}
          onChange={(event) => onTagFilterChange(event.target.value)}
          placeholder="Tag"
          className="workbench-input"
        />
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SearchSort)}
          className="workbench-input"
          aria-label="Sort repositories"
        >
          <option value="updated">Updated</option>
          <option value="recent">Recent</option>
          <option value="stars">Stars</option>
          <option value="relevance">Relevance</option>
        </select>
        <button
          type="button"
          onClick={onFavoritesToggle}
          className={favoritesOnly ? "workbench-button workbench-button--active" : "workbench-button workbench-button--ghost"}
        >
          <Star className="h-4 w-4" />
          Favorites
        </button>
        <button type="button" onClick={onClearFilters} className="workbench-button workbench-button--ghost">
          <X className="h-4 w-4" />
          Clear
        </button>
        <button type="button" onClick={onResetSort} className="workbench-button workbench-button--ghost">
          Reset sort
        </button>
      </div>

      <div className="repo-table-pane__header">
        <span />
        <span>Repository</span>
        <span>Stars</span>
        <span>Language</span>
        <span>Updated</span>
        <span>Tags</span>
        <span />
        <span />
      </div>

      <div className="repo-table-pane__body">
        {repos.map((repo) => (
          <RepoTableRow
            key={repo.id}
            repo={repo}
            selected={repo.id === selectedId}
            onSelect={() => onSelect(repo.id)}
          />
        ))}
        {repos.length === 0 ? (
          <div className="repo-table-empty">
            <p className="repo-table-empty__title">No synced repositories yet.</p>
            <p className="repo-table-empty__body">
              Run your first GitHub sync to import public starred repositories into the workbench.
            </p>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="workbench-button workbench-button--primary"
            >
              {syncing ? "Syncing" : "Start first sync"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="repo-table-pane__footer">
        <p>{repos.length === 0 ? "0" : `${pageStart}-${pageEnd}`} of {total} repositories</p>
        <div className="repo-table-pagination">
          <button
            type="button"
            className={safePage <= 1 ? "repo-page-chip repo-page-chip--ghost" : "repo-page-chip"}
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
          >
            Prev
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
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
