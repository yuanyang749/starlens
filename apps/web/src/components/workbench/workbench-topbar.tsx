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
  const [menuOpen, setMenuOpen] = useState(false);
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
          aria-label="搜索你的 Stars"
          role="searchbox"
          value={queryDraft}
          onChange={(event) => onQueryDraftChange(event.target.value)}
          placeholder="搜索你的 Stars..."
          className="w-full bg-transparent outline-none"
        />
        {queryDraft ? (
          <button
            type="button"
            className="workbench-input-clear"
            aria-label="清空搜索"
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
          aria-label="搜索仓库"
        >
          <Search className="h-4 w-4" />
          搜索
        </button>
        <button
          type="button"
          onClick={onAiSearch}
          disabled={aiSearching || !canSearch}
          aria-busy={aiSearching}
          className={aiSearching
            ? "workbench-button workbench-button--primary workbench-button--loading"
            : "workbench-button workbench-button--primary"}
          aria-label={aiSearching ? "AI 搜索中" : "AI 搜索"}
        >
          {aiSearching ? (
            <LoaderCircle className="h-4 w-4 workbench-button__spinner" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {aiSearching ? "搜索中..." : "AI 搜索"}
        </button>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncing}
          aria-busy={syncing}
          className={syncing
            ? "workbench-button workbench-button--primary workbench-button--loading"
            : "workbench-button workbench-button--primary"}
          aria-label={syncing ? "同步中" : "立即同步"}
        >
          <RefreshCw className={syncing ? "h-4 w-4 workbench-button__spinner" : "h-4 w-4"} />
          {syncing ? "同步中..." : "立即同步"}
        </button>
        <div className="workbench-topbar__avatar-container">
          <button
            type="button"
            className="workbench-avatar-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="用户菜单"
          >
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
          </button>

          {menuOpen && (
            <>
              <div
                className="workbench-avatar-menu-backdrop"
                onClick={() => setMenuOpen(false)}
              />
              <div className="workbench-avatar-menu">
                <div className="workbench-avatar-menu__user-info">
                  <span className="workbench-avatar-menu__avatar">
                    {canShowAvatarImage ? (
                      <Image
                        src={userAvatarUrl ?? ""}
                        alt={userName}
                        fill
                        sizes="36px"
                        unoptimized
                        className="workbench-user-pill__avatar-image"
                        onError={() => setAvatarFailed(true)}
                      />
                    ) : (
                      userName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="workbench-avatar-menu__username" title={userName}>
                    {userName}
                  </div>
                </div>
                <div className="workbench-avatar-menu__divider" />
                <SignOutButton className="workbench-button workbench-button--ghost w-full justify-center" />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
