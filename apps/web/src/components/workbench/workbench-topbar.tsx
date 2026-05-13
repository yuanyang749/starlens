"use client";

import { BrandLogo } from "@/components/brand-logo";
import Image from "next/image";
import { useState } from "react";
import { LoaderCircle, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { SignOutButton } from "../sign-out-button";

type WorkbenchTopbarProps = {
  queryDraft: string;
  onQueryDraftChange: (value: string) => void;
  onSearch: () => void;
  canSearch: boolean;
  aiSearching: boolean;
  onAiSearch: () => void;
  syncing: boolean;
  onSyncNow: () => void;
  userName: string;
  userAvatarUrl?: string | null;
};

export function WorkbenchTopbar({
  queryDraft,
  onQueryDraftChange,
  onSearch,
  canSearch,
  aiSearching,
  onAiSearch,
  syncing,
  onSyncNow,
  userName,
  userAvatarUrl,
}: WorkbenchTopbarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const canShowAvatarImage = Boolean(userAvatarUrl) && !avatarFailed;

  return (
    <header data-testid="workbench-topbar" className="workbench-topbar">
      <div className="workbench-brand">
        <span className="workbench-brand__mark" aria-hidden="true">
          <BrandLogo size={40} className="workbench-brand__logo" priority />
        </span>
        <div className="workbench-brand__copy">
          <span className="workbench-brand__title">Starlens</span>
        </div>
      </div>

      <label className="workbench-topbar__search">
        <Search className="h-4 w-4 shrink-0" />
        <input
          aria-label="Search your starred repositories"
          role="searchbox"
          value={queryDraft}
          onChange={(event) => onQueryDraftChange(event.target.value)}
          placeholder="Search your starred repositories..."
          className="w-full bg-transparent outline-none"
        />
        {queryDraft ? (
          <button
            type="button"
            className="workbench-input-clear"
            aria-label="Clear search"
            onClick={() => onQueryDraftChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>

      <div className="workbench-topbar__actions">
        <button
          type="button"
          onClick={onSearch}
          disabled={!canSearch}
          className="workbench-button workbench-button--ghost"
          aria-label="Search repositories"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
        <button
          type="button"
          onClick={onAiSearch}
          disabled={aiSearching || !canSearch}
          aria-busy={aiSearching}
          className={aiSearching
            ? "workbench-button workbench-button--primary workbench-button--loading"
            : "workbench-button workbench-button--primary"}
          aria-label={aiSearching ? "AI searching" : "AI Search"}
        >
          {aiSearching ? (
            <LoaderCircle className="h-4 w-4 workbench-button__spinner" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {aiSearching ? "Searching..." : "AI Search"}
        </button>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncing}
          aria-busy={syncing}
          className={syncing
            ? "workbench-button workbench-button--primary workbench-button--loading"
            : "workbench-button workbench-button--primary"}
          aria-label={syncing ? "Syncing" : "Sync now"}
        >
          <RefreshCw className={syncing ? "h-4 w-4 workbench-button__spinner" : "h-4 w-4"} />
          {syncing ? "Syncing..." : "Sync now"}
        </button>
        <SignOutButton className="workbench-button workbench-button--ghost" />
        <div className="workbench-user-pill" aria-label={userName}>
          <span className="workbench-user-pill__avatar">
            {canShowAvatarImage ? (
              <Image
                src={userAvatarUrl ?? ""}
                alt={userName}
                fill
                sizes="40px"
                unoptimized
                className="workbench-user-pill__avatar-image"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              userName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="workbench-user-pill__label">{userName}</span>
        </div>
      </div>
    </header>
  );
}
