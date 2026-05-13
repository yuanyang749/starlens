"use client";

import { Bot, ChevronsLeft, ChevronsRight, Clock3, KeyRound, Search, Settings2, Star } from "lucide-react";

type WorkbenchSidebarProps = {
  contentMode: "repos" | "general" | "providers" | "tokens";
  favoritesOnly: boolean;
  aiSearchActive: boolean;
  onFavoritesClick: () => void;
  onAllStarsClick: () => void;
  onRecentClick: () => void;
  onOpenGeneral: () => void;
  onOpenProviders: () => void;
  onOpenTokens: () => void;
  recentActive: boolean;
  total: number;
  favoriteCount: number;
  lastSyncText: string;
  syncStatusText: string;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
};

export function WorkbenchSidebar({
  contentMode,
  favoritesOnly,
  aiSearchActive,
  onFavoritesClick,
  onAllStarsClick,
  onRecentClick,
  onOpenGeneral,
  onOpenProviders,
  onOpenTokens,
  recentActive,
  total,
  favoriteCount,
  lastSyncText,
  syncStatusText,
  collapsed,
  onCollapsedChange,
}: WorkbenchSidebarProps) {
  const reposActive = contentMode === "repos";

  return (
    <aside data-testid="workbench-sidebar" className={collapsed ? "workbench-sidebar is-collapsed" : "workbench-sidebar"}>
      <button
        type="button"
        className="workbench-sidebar__toggle"
        onClick={() => onCollapsedChange(!collapsed)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        <span className="workbench-sidebar__toggle-text">Collapse</span>
      </button>
      <div className="workbench-sidebar__groups">
        <section className="workbench-nav-section" aria-label="Workbench">
          <p className="workbench-nav-section__title">WORKBENCH</p>
          <button
            type="button"
            onClick={onAllStarsClick}
            className={reposActive && !favoritesOnly && !recentActive && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="All Stars"
          >
            <span className="workbench-nav-item__leading">
              <Search className="h-4 w-4" />
              <span className="workbench-nav-item__label">All Stars</span>
            </span>
            <span>{total}</span>
          </button>
          <button
            type="button"
            onClick={onFavoritesClick}
            className={reposActive && favoritesOnly && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="Favorites"
          >
            <span className="workbench-nav-item__leading">
              <Star className="h-4 w-4" />
              <span className="workbench-nav-item__label">Favorites</span>
            </span>
            <span>{favoriteCount}</span>
          </button>
          <button
            type="button"
            onClick={onRecentClick}
            className={reposActive && recentActive && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="Recent"
          >
            <span className="workbench-nav-item__leading">
              <Clock3 className="h-4 w-4" />
              <span className="workbench-nav-item__label">Recent</span>
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="Tools">
          <p className="workbench-nav-section__title">TOOLS</p>
          <button
            type="button"
            onClick={onOpenProviders}
            className={contentMode === "providers" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="Providers"
          >
            <span className="workbench-nav-item__leading">
              <Bot className="h-4 w-4" />
              <span className="workbench-nav-item__label">Providers</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenTokens}
            className={contentMode === "tokens" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="Tokens"
          >
            <span className="workbench-nav-item__leading">
              <KeyRound className="h-4 w-4" />
              <span className="workbench-nav-item__label">Tokens</span>
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="System">
          <p className="workbench-nav-section__title">SYSTEM</p>
          <button
            type="button"
            onClick={onOpenGeneral}
            className={contentMode === "general" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="General"
          >
            <span className="workbench-nav-item__leading">
              <Settings2 className="h-4 w-4" />
              <span className="workbench-nav-item__label">General</span>
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
