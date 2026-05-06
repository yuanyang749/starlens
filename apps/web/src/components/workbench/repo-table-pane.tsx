"use client";

import type { RepoSummary, SearchSort } from "@starlens/core";
import { Search, Star, X } from "lucide-react";
import { RepoTableRow } from "./repo-table-row";

type RepoTablePaneProps = {
  repos: RepoSummary[];
  total: number;
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
};

export function RepoTablePane({
  repos,
  total,
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
}: RepoTablePaneProps) {
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
        <p>{repos.length === 0 ? "0" : `1-${repos.length}`} of {total} repositories</p>
        <div className="repo-table-pagination">
          <button type="button" className="repo-page-chip is-active">1</button>
          <button type="button" className="repo-page-chip">2</button>
          <button type="button" className="repo-page-chip">3</button>
          <span className="repo-page-chip repo-page-chip--ghost">…</span>
          <button type="button" className="repo-page-chip">96</button>
        </div>
      </div>
    </section>
  );
}
