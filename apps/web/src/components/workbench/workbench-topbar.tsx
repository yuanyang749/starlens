"use client";

import { Bell, Search, Settings2, Sparkles, Star } from "lucide-react";
import { SignOutButton } from "../sign-out-button";

type WorkbenchTopbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  syncing: boolean;
  onSync: () => void;
  userName: string;
};

export function WorkbenchTopbar({
  query,
  onQueryChange,
  syncing,
  onSync,
  userName,
}: WorkbenchTopbarProps) {
  return (
    <header data-testid="workbench-topbar" className="workbench-topbar">
      <div className="workbench-brand">
        <span className="workbench-brand__mark" aria-hidden="true">
          <Star className="h-4 w-4 fill-current" />
        </span>
        <div className="workbench-brand__copy">
          <span className="workbench-brand__title">Stars Finder</span>
          <span className="workbench-brand__subtle">Workbench</span>
        </div>
      </div>

      <label className="workbench-topbar__search">
        <Search className="h-4 w-4 shrink-0" />
        <input
          aria-label="Search your starred repositories"
          role="searchbox"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search your starred repositories..."
          className="w-full bg-transparent outline-none"
        />
        <span className="workbench-topbar__shortcut">⌘ K</span>
      </label>

      <div className="workbench-topbar__actions">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="workbench-button workbench-button--ghost"
          aria-label={syncing ? "Syncing" : "Sync now"}
        >
          {syncing ? "Syncing" : "Sync now"}
        </button>
        <button type="button" className="workbench-button workbench-button--primary">
          <Sparkles className="h-4 w-4" />
          AI Search
        </button>
        <button type="button" className="workbench-button workbench-button--ghost">
          Filters
        </button>
        <button
          type="button"
          className="workbench-icon-button"
          aria-label="Settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="workbench-icon-button"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <SignOutButton className="workbench-button workbench-button--ghost" />
        <div className="workbench-user-pill" aria-label={userName}>
          <span className="workbench-user-pill__avatar">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="workbench-user-pill__label">{userName}</span>
        </div>
      </div>
    </header>
  );
}
