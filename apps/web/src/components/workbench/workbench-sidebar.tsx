"use client";

import Link from "next/link";
import { BookOpen, Bot, ChevronsLeft, ChevronsRight, Clock3, KeyRound, Search, Settings2, Shield, Star, LayoutDashboard } from "lucide-react";

type WorkbenchSidebarProps = {
  contentMode: "repos" | "general" | "providers" | "tokens" | "admin" | "dashboard";
  favoritesOnly: boolean;
  aiSearchActive: boolean;
  onFavoritesClick: () => void;
  onAllStarsClick: () => void;
  onRecentClick: () => void;
  onOpenGeneral: () => void;
  onOpenProviders: () => void;
  onOpenTokens: () => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  adminUserCount?: number | null;
  onOpenDashboard: () => void;
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
  isAdmin,
  onOpenAdmin,
  adminUserCount,
  onOpenDashboard,
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
        aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        <span className="workbench-sidebar__toggle-text">收起</span>
      </button>
      <div className="workbench-sidebar__groups">
        <section className="workbench-nav-section" aria-label="工作台">
          <p className="workbench-nav-section__title">工作台</p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className={contentMode === "dashboard" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="数据看板"
          >
            <span className="workbench-nav-item__leading">
              <LayoutDashboard className="h-4 w-4" />
              <span className="workbench-nav-item__label">数据看板</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onAllStarsClick}
            className={reposActive && !favoritesOnly && !recentActive && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="全部 Stars"
          >
            <span className="workbench-nav-item__leading">
              <Search className="h-4 w-4" />
              <span className="workbench-nav-item__label">全部 Stars</span>
            </span>
            <span>{total}</span>
          </button>
          <button
            type="button"
            onClick={onFavoritesClick}
            className={reposActive && favoritesOnly && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="重点收藏"
          >
            <span className="workbench-nav-item__leading">
              <Star className="h-4 w-4" />
              <span className="workbench-nav-item__label">重点收藏</span>
            </span>
            <span>{favoriteCount}</span>
          </button>
          <button
            type="button"
            onClick={onRecentClick}
            className={reposActive && recentActive && !aiSearchActive ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="最近同步"
          >
            <span className="workbench-nav-item__leading">
              <Clock3 className="h-4 w-4" />
              <span className="workbench-nav-item__label">最近同步</span>
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="工具">
          <p className="workbench-nav-section__title">工具</p>
          {/* 中文注释：工作台直接补充文档入口，方便用户从操作界面跳回功能和配置说明。 */}
          <Link href="/docs" className="workbench-nav-item" aria-label="使用文档" target="_blank" rel="noopener noreferrer">
            <span className="workbench-nav-item__leading">
              <BookOpen className="h-4 w-4" />
              <span className="workbench-nav-item__label">使用文档</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onOpenProviders}
            className={contentMode === "providers" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="AI Provider"
          >
            <span className="workbench-nav-item__leading">
              <Bot className="h-4 w-4" />
              <span className="workbench-nav-item__label">AI Provider</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenTokens}
            className={contentMode === "tokens" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="API Token"
          >
            <span className="workbench-nav-item__leading">
              <KeyRound className="h-4 w-4" />
              <span className="workbench-nav-item__label">API Token</span>
            </span>
          </button>
        </section>

        <section className="workbench-nav-section" aria-label="系统">
          <p className="workbench-nav-section__title">系统</p>
          {isAdmin && onOpenAdmin ? (
            <button
              type="button"
              onClick={onOpenAdmin}
              className={contentMode === "admin" ? "workbench-nav-item is-active" : "workbench-nav-item"}
              aria-label="用户管理"
            >
              <span className="workbench-nav-item__leading">
                <Shield className="h-4 w-4" />
                <span className="workbench-nav-item__label">用户管理</span>
              </span>
              {typeof adminUserCount === "number" ? <span>{adminUserCount}</span> : null}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenGeneral}
            className={contentMode === "general" ? "workbench-nav-item is-active" : "workbench-nav-item"}
            aria-label="通用设置"
          >
            <span className="workbench-nav-item__leading">
              <Settings2 className="h-4 w-4" />
              <span className="workbench-nav-item__label">通用设置</span>
            </span>
          </button>
        </section>
      </div>

      {/* 大赛拉票卡片 ฅ'ω'ฅ */}
      <a
        href="https://forum.trae.cn/t/topic/70912"
        target="_blank"
        rel="noopener noreferrer"
        className={collapsed ? "workbench-vote-card is-collapsed" : "workbench-vote-card"}
        title="前往 TRAE AI 大赛为 Starlens 投票！"
      >
        {collapsed ? (
          <div className="workbench-vote-card__collapsed-icon">
            <span className="animate-pulse">💜</span>
          </div>
        ) : (
          <>
            <div className="workbench-vote-card__badge">
              <span>TRAE 大赛</span>
            </div>
            <p className="workbench-vote-card__text">
              Starlens 正在参加“TRAE AI 创造力大赛”！如果它帮到了你，请投我一票！
            </p>
            <div className="workbench-vote-card__go">
              去投票 💜
            </div>
          </>
        )}
      </a>

      <div className="workbench-sync-card">
        <p className="workbench-sync-card__label">上次同步</p>
        <p className="workbench-sync-card__value">{lastSyncText}</p>
        <p className="workbench-sync-card__meta">{syncStatusText}</p>
      </div>
    </aside>
  );
}
