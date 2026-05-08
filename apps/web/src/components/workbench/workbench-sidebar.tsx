"use client";

import { Clock3, KeyRound, Search, Settings2, Sparkles, Star, Tag } from "lucide-react";

type WorkbenchSidebarProps = {
  contentMode: "repos" | "settings" | "settings-ai" | "settings-tokens";
  favoritesOnly: boolean;
  aiSearchActive: boolean;
  onFavoritesClick: () => void;
  onAllStarsClick: () => void;
  onRecentClick: () => void;
  onAiSearchClick: () => void;
  onOpenSettings: () => void;
  onOpenTokens: () => void;
  recentActive: boolean;
  total: number;
  favoriteCount: number;
  lastSyncText: string;
  syncStatusText: string;
};

export function WorkbenchSidebar({
  contentMode,
  favoritesOnly,
  aiSearchActive,
  onFavoritesClick,
  onAllStarsClick,
  onRecentClick,
  onAiSearchClick,
  onOpenSettings,
  onOpenTokens,
  recentActive,
  total,
  favoriteCount,
  lastSyncText,
  syncStatusText,
}: WorkbenchSidebarProps) {
  const reposActive = contentMode === "repos";

  return (
    <aside data-testid="workbench-sidebar" className="workbench-sidebar">
      <div className="workbench-sidebar__groups">
        <section className="workbench-nav-section" aria-label="Workbench">
          <p className="workbench-nav-section__title">WORKBENCH</p>
          <button
            type="button"
            onClick={onAllStarsClick}
            className={reposActive && !favoritesOnly && !recentActive && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
          >
            <span className="workbench-nav-item__leading">
              <Search className="h-4 w-4" />
              All Stars
            </span>
            <span>{total}</span>
          </button>
          <button
            type="button"
            onClick={onFavoritesClick}
            className={reposActive && favoritesOnly && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
          >
            <span className="workbench-nav-item__leading">
              <Star className="h-4 w-4" />
              Favorites
            </span>
            <span>{favoriteCount}</span>
          </button>
          <button
            type="button"
            onClick={onRecentClick}
            className={reposActive && recentActive && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
          >
            <span className="workbench-nav-item__leading">
              <Clock3 className="h-4 w-4" />
              Recent
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="Discover">
          <p className="workbench-nav-section__title">DISCOVER</p>
          <div className="workbench-nav-item is-passive">
            <span className="workbench-nav-item__leading">
              <Tag className="h-4 w-4" />
              Languages
            </span>
          </div>
          <div className="workbench-nav-item is-passive">
            <span className="workbench-nav-item__leading">
              <Tag className="h-4 w-4" />
              Tags
            </span>
          </div>
          <button
            type="button"
            onClick={onAiSearchClick}
            className={reposActive && aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
          >
            <span className="workbench-nav-item__leading">
              <Sparkles className="h-4 w-4" />
              AI Search
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="Tools">
          <p className="workbench-nav-section__title">TOOLS</p>
          <button
            type="button"
            onClick={onOpenTokens}
            className={contentMode === "settings-tokens" ? "workbench-nav-item is-active" : "workbench-nav-item"}
          >
            <span className="workbench-nav-item__leading">
              <KeyRound className="h-4 w-4" />
              Tokens
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="System">
          <p className="workbench-nav-section__title">SYSTEM</p>
          <button
            type="button"
            onClick={onOpenSettings}
            className={contentMode === "settings" || contentMode === "settings-ai" ? "workbench-nav-item is-active" : "workbench-nav-item"}
          >
            <span className="workbench-nav-item__leading">
              <Settings2 className="h-4 w-4" />
              Settings
            </span>
          </button>
        </section>
      </div>

      <div className="workbench-sync-card">
        <p className="workbench-sync-card__label">Last sync</p>
        <p className="workbench-sync-card__value">{lastSyncText}</p>
        <p className="workbench-sync-card__meta">{syncStatusText}</p>
      </div>
    </aside>
  );
}
