"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { AiConfig, ProviderType, RepoSummary, TokenRecord } from "@starlens-app/core";
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronUp,
  Clock,
  ExternalLink,
  Github,
  GitFork,
  Hash,
  KeyRound,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  fetchApi,
  useMobileWorkbench,
  type SettingsSection,
  type WorkbenchMode,
} from "@starlens/workbench";
import {
  formatCompactNumber,
  formatDateTime,
  safeExternalUrl,
  sanitizeSummaryText,
} from "@starlens/workbench/formatters";

type MobileWorkbenchProps = {
  basePath?: string;
  userName: string;
  userAvatarUrl?: string | null;
};

type ProviderForm = {
  apiKey: string;
  baseUrl: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  model: string;
  providerType: ProviderType;
};

type CreatedToken = TokenRecord & { token?: string };

const providerOptions: Array<{ label: string; value: ProviderType }> = [
  { label: "OpenAI-compatible", value: "openai_compatible" },
  { label: "Anthropic Native", value: "anthropic_native" },
  { label: "Gemini Native", value: "gemini_native" },
  { label: "DeepSeek Native", value: "deepseek_native" },
];

const tabs: Array<{ mode: WorkbenchMode; label: string; icon: typeof Search }> = [
  { mode: "all", label: "Stars", icon: Search },
  { mode: "favorites", label: "重点", icon: Star },
  { mode: "recent", label: "最近", icon: Clock },
  { mode: "settings", label: "设置", icon: Settings2 },
];

const settingsSectionLabels: Record<SettingsSection, string> = {
  general: "通用",
  providers: "AI Provider",
  tokens: "API Token",
};

// 中文注释：常见语言的品牌色，用于卡片上的语言色点，提升信息可辨识度。
const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#6b7280",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

function languageColor(language?: string | null) {
  return (language && languageColors[language]) || "#94a3b8";
}

function repoSummary(repo: RepoSummary) {
  return sanitizeSummaryText(repo.aiSummary || repo.repoSummary || repo.description);
}

function maskToken(token: Pick<TokenRecord, "tokenPrefix" | "tokenSuffix">, rawToken?: string) {
  if (rawToken) return `${rawToken.slice(0, 10)}********${rawToken.slice(-6)}`;
  return `${token.tokenPrefix}********${token.tokenSuffix || "******"}`;
}

function RepoCard({
  repo,
  selected,
  favoriteUpdating,
  onOpen,
  onFavorite,
}: {
  repo: RepoSummary;
  selected: boolean;
  favoriteUpdating: boolean;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  const summary = repoSummary(repo);
  const [owner, ...rest] = repo.fullName.split("/");
  const name = rest.join("/") || repo.fullName;
  const chips = (repo.tags.length > 0 ? repo.tags : repo.topics).slice(0, 3);

  return (
    <article className={selected ? "mobile-repo-card is-selected" : "mobile-repo-card"}>
      <button
        type="button"
        className="mobile-repo-card__fav"
        disabled={favoriteUpdating}
        onClick={onFavorite}
        aria-label={repo.isFavorite ? "已重点收藏" : "重点收藏"}
        aria-pressed={repo.isFavorite}
      >
        <Star className={repo.isFavorite ? "h-[18px] w-[18px] fill-current" : "h-[18px] w-[18px]"} />
      </button>

      <button type="button" className="mobile-repo-card__body" onClick={onOpen}>
        <h2 className="mobile-repo-card__title">
          <span className="mobile-repo-card__owner">{owner}/</span>
          {name}
        </h2>
        <p className="mobile-repo-card__summary">{summary || "暂无摘要。"}</p>
      </button>

      <div className="mobile-repo-card__meta">
        <span className="mobile-meta-item">
          <Star className="h-3.5 w-3.5" />
          {formatCompactNumber(repo.stargazersCount)}
        </span>
        {repo.language ? (
          <span className="mobile-meta-item">
            <span className="mobile-lang-dot" style={{ background: languageColor(repo.language) }} />
            {repo.language}
          </span>
        ) : null}
        <span className="mobile-meta-item mobile-meta-item--time">
          {formatDateTime(repo.updatedAtGithub)}
        </span>
      </div>

      {chips.length > 0 ? (
        <div className="mobile-chip-row">
          {chips.map((item) => (
            <span className="mobile-chip" key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function RepoDetail({
  repo,
  noteDraft,
  newTag,
  favoriteUpdating,
  tagSubmitting,
  tagDeleting,
  onClose,
  onFavorite,
  onNoteChange,
  onSaveNote,
  onNewTagChange,
  onAddTag,
  onDeleteTag,
}: {
  repo: RepoSummary;
  noteDraft: string;
  newTag: string;
  favoriteUpdating: boolean;
  tagSubmitting: boolean;
  tagDeleting: string | null;
  onClose: () => void;
  onFavorite: () => void;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  onNewTagChange: (value: string) => void;
  onAddTag: () => void;
  onDeleteTag: (tag: string) => void;
}) {
  const githubUrl = safeExternalUrl(repo.htmlUrl);
  const homepageUrl = safeExternalUrl(repo.homepage);
  const summary = repoSummary(repo) || "README 摘要暂不可用。";
  const [owner, ...rest] = repo.fullName.split("/");
  const name = rest.join("/") || repo.fullName;

  return (
    <aside className="mobile-detail" aria-label="已选仓库">
      <div className="mobile-detail-header">
        <button type="button" className="mobile-icon-button" onClick={onClose} aria-label="返回仓库列表">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <strong>仓库</strong>
        <button type="button" className="mobile-icon-button" onClick={onClose} aria-label="关闭详情">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mobile-detail-body">
        <section className="mobile-detail-hero">
          <h1>
            <span className="mobile-repo-card__owner">{owner}/</span>
            {name}
          </h1>
          {repo.description ? <p className="mt-2">{repo.description}</p> : null}
          <div className="mobile-detail-stats">
            <span className="mobile-meta-item">
              <Star className="h-4 w-4" />
              {formatCompactNumber(repo.stargazersCount)}
            </span>
            <span className="mobile-meta-item">
              <GitFork className="h-4 w-4" />
              {formatCompactNumber(repo.forksCount)}
            </span>
            {repo.language ? (
              <span className="mobile-meta-item">
                <span className="mobile-lang-dot" style={{ background: languageColor(repo.language) }} />
                {repo.language}
              </span>
            ) : null}
          </div>
          <div className="mobile-detail-cta">
            <button
              type="button"
              className={repo.isFavorite ? "mobile-button mobile-button--primary" : "mobile-button"}
              disabled={favoriteUpdating}
              onClick={onFavorite}
            >
              <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {repo.isFavorite ? "已重点" : "重点收藏"}
            </button>
            {githubUrl ? (
              <a className="mobile-icon-button" href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 打开">
                <Github className="h-5 w-5" />
              </a>
            ) : null}
            {homepageUrl ? (
              <a className="mobile-icon-button" href={homepageUrl} target="_blank" rel="noopener noreferrer" aria-label="打开主页">
                <ExternalLink className="h-5 w-5" />
              </a>
            ) : null}
          </div>
        </section>

        <section className="mobile-detail-section">
          <h2 className="mobile-section-title">摘要</h2>
          <p>{summary}</p>
        </section>

        <section className="mobile-detail-section">
          <h2 className="mobile-section-title">我的备注</h2>
          <textarea
            className="mobile-textarea"
            aria-label="我的备注"
            placeholder="记录想法、用途或待办……"
            value={noteDraft}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <button type="button" className="mobile-button mobile-button--primary mt-2" onClick={onSaveNote}>
            <Check className="h-4 w-4" />
            保存备注
          </button>
        </section>

        <section className="mobile-detail-section">
          <h2 className="mobile-section-title">标签</h2>
          {repo.tags.length > 0 ? (
            <div className="mobile-chip-row">
              {repo.tags.map((tag) => (
                <button
                  type="button"
                  className="mobile-chip-button"
                  disabled={Boolean(tagDeleting)}
                  onClick={() => onDeleteTag(tag)}
                  key={tag}
                >
                  {tag}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mobile-muted-hint">还没有标签，添加一个开始整理吧。</p>
          )}
          <div className="mobile-tag-editor mt-3">
            <input
              className="mobile-input"
              value={newTag}
              onChange={(event) => onNewTagChange(event.target.value)}
              placeholder="新标签"
            />
            <button type="button" className="mobile-button" disabled={tagSubmitting} onClick={onAddTag}>
              <Plus className="h-4 w-4" />
              添加
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

function MobileSettings({
  section,
  providers,
  tokens,
  onSectionChange,
  onReload,
  onError,
  onMessage,
}: {
  section: SettingsSection;
  providers: AiConfig[];
  tokens: TokenRecord[];
  onSectionChange: (section: SettingsSection) => void;
  onReload: () => void;
  onError: (message: string | null) => void;
  onMessage: (message: string | null) => void;
}) {
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    apiKey: "",
    baseUrl: "",
    displayName: "",
    enabled: true,
    isDefault: false,
    model: "",
    providerType: "openai_compatible",
  });
  const [tokenNote, setTokenNote] = useState("");
  const [copyableTokens, setCopyableTokens] = useState<Record<string, string>>({});

  async function createProvider() {
    try {
      await fetchApi<AiConfig>("/api/ai/configs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...providerForm,
          apiKey: providerForm.apiKey || undefined,
          baseUrl: providerForm.baseUrl || undefined,
        }),
      });
      setProviderForm((current) => ({ ...current, apiKey: "" }));
      onMessage("Provider 配置已保存。");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Provider 创建失败。");
    }
  }

  async function validateProvider(id: string) {
    try {
      const result = await fetchApi<{ message: string; status: string }>(`/api/ai/configs/${id}/validate`, { method: "POST" });
      onMessage(result.message || `验证${result.status === "success" ? "成功" : `结果：${result.status}`}。`);
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Provider 验证失败。");
    }
  }

  async function deleteProvider(id: string) {
    try {
      await fetchApi(`/api/ai/configs/${id}`, { method: "DELETE" });
      onMessage("Provider 已删除。");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Provider 删除失败。");
    }
  }

  async function createToken() {
    const note = tokenNote.trim();
    if (!note) {
      onError("请填写 Token 用途备注。");
      return;
    }

    try {
      const token = await fetchApi<CreatedToken>("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `移动端 Token ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
          note,
        }),
      });
      if (token.token) {
        setCopyableTokens((current) => ({ ...current, [token.id]: token.token! }));
      }
      setTokenNote("");
      onMessage("Token 已创建。");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Token 创建失败。");
    }
  }

  async function revokeToken(id: string) {
    try {
      await fetchApi(`/api/tokens/${id}`, { method: "DELETE" });
      onMessage("Token 已撤销。");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Token 撤销失败。");
    }
  }

  return (
    <section className="mobile-settings-panel">
      <div className="mobile-segment" role="tablist" aria-label="设置分区">
        {(["general", "providers", "tokens"] as SettingsSection[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={section === item}
            className={section === item ? "mobile-segment__item is-active" : "mobile-segment__item"}
            onClick={() => onSectionChange(item)}
          >
            {settingsSectionLabels[item]}
          </button>
        ))}
      </div>

      {section === "general" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <span className="mobile-settings-item__label">界面语言</span>
            <span className="mobile-settings-item__value">简体中文</span>
          </article>
          <article className="mobile-settings-item">
            <span className="mobile-settings-item__label">构建信息</span>
            <span className="mobile-settings-item__value">Starlens Mobile 0.1.1</span>
          </article>
        </div>
      ) : null}

      {section === "providers" ? (
        <div className="mobile-settings-list">
          <article className="mobile-form-card">
            <strong className="mobile-form-card__title">新建 Provider</strong>
            <div className="mobile-form-grid">
              <input className="mobile-input" placeholder="显示名称" value={providerForm.displayName} onChange={(event) => setProviderForm((current) => ({ ...current, displayName: event.target.value }))} />
              <select className="mobile-select" value={providerForm.providerType} onChange={(event) => setProviderForm((current) => ({ ...current, providerType: event.target.value as ProviderType }))}>
                {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input className="mobile-input" placeholder="模型" value={providerForm.model} onChange={(event) => setProviderForm((current) => ({ ...current, model: event.target.value }))} />
              <input className="mobile-input" placeholder="Base URL" value={providerForm.baseUrl} onChange={(event) => setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} />
              <input className="mobile-input" placeholder="API Key" type="password" value={providerForm.apiKey} onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))} />
              <button type="button" className="mobile-button mobile-button--primary" onClick={createProvider}>
                <Bot className="h-4 w-4" />
                创建 Provider
              </button>
            </div>
          </article>
          {providers.map((provider) => (
            <article key={provider.id} className="mobile-settings-card">
              <div className="mobile-settings-card__head">
                <strong>{provider.displayName}</strong>
                {provider.isDefault ? <span className="mobile-badge">默认</span> : null}
              </div>
              <p className="mobile-settings-card__sub">{provider.providerType} · {provider.model}</p>
              <div className="mobile-settings-card__actions">
                <button type="button" className="mobile-button mobile-button--ghost" onClick={() => validateProvider(provider.id)}>
                  <ShieldCheck className="h-4 w-4" />
                  验证
                </button>
                <button type="button" className="mobile-button mobile-button--danger" onClick={() => deleteProvider(provider.id)}>
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {section === "tokens" ? (
        <div className="mobile-settings-list">
          <article className="mobile-form-card">
            <strong className="mobile-form-card__title">新建 Token</strong>
            <div className="mobile-form-grid">
              <input className="mobile-input" placeholder="用途备注" value={tokenNote} onChange={(event) => setTokenNote(event.target.value)} />
              <button type="button" className="mobile-button mobile-button--primary" onClick={createToken}>
                <KeyRound className="h-4 w-4" />
                创建 Token
              </button>
            </div>
          </article>
          {tokens.map((token) => (
            <article key={token.id} className="mobile-settings-card">
              <div className="mobile-settings-card__head">
                <strong>{token.name}</strong>
              </div>
              {token.note ? <p className="mobile-settings-card__sub">{token.note}</p> : null}
              <p className="mobile-token-code">{maskToken(token, copyableTokens[token.id])}</p>
              <div className="mobile-settings-card__actions">
                {copyableTokens[token.id] ? (
                  <button
                    type="button"
                    className="mobile-button mobile-button--ghost"
                    onClick={() => navigator.clipboard.writeText(copyableTokens[token.id])}
                  >
                    复制
                  </button>
                ) : null}
                <button type="button" className="mobile-button mobile-button--danger" onClick={() => revokeToken(token.id)}>
                  <Trash2 className="h-4 w-4" />
                  撤销
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function MobileWorkbench({ basePath = "/", userName, userAvatarUrl }: MobileWorkbenchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoParam = searchParams.get("repo");
  const workbench = useMobileWorkbench();
  const { actions } = workbench;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (repoParam && repoParam !== workbench.selectedId) {
      actions.setSelectedId(repoParam);
    }
  }, [actions, repoParam, workbench.selectedId]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || workbench.mode === "settings" || !workbench.hasMore) {
      return;
    }

    // 中文注释：滚动接近列表底部时提前加载下一页，替代移动端按钮分页。
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void actions.loadMore();
      }
    }, { rootMargin: "240px 0px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [actions, workbench.hasMore, workbench.mode]);

  function openRepo(repo: RepoSummary) {
    actions.setSelectedId(repo.id);
    router.push(`${basePath}?repo=${encodeURIComponent(repo.id)}`, { scroll: false });
  }

  function closeRepo() {
    router.push(basePath, { scroll: false });
  }

  const canSearch = Boolean(workbench.queryDraft.trim());
  const showingDetail = Boolean(repoParam && workbench.selectedRepo);
  const isSettings = workbench.mode === "settings";

  return (
    <main className="mobile-shell">
      <header className={searchCollapsed ? "mobile-topbar is-collapsed" : "mobile-topbar"}>
        <div className="mobile-title-row">
          <div className="mobile-brand">
            <Image
              src="/brand/logo.png"
              alt="Starlens"
              width={32}
              height={32}
              className="mobile-brand__logo-img"
              unoptimized
            />
            <div className="mobile-brand__text">
              <strong>Starlens</strong>
              <span>@{userName}</span>
            </div>
          </div>
          <div className="mobile-title-actions">
            {!isSettings ? (
              <button
                type="button"
                className="mobile-icon-button"
                aria-label={workbench.syncing ? "正在同步" : "同步 Stars"}
                disabled={workbench.syncing}
                onClick={() => void actions.syncNow()}
              >
                <RefreshCw className={workbench.syncing ? "h-5 w-5 animate-spin" : "h-5 w-5"} />
              </button>
            ) : null}
            {!isSettings ? (
              <button
                type="button"
                className="mobile-icon-button"
                aria-expanded={!searchCollapsed}
                aria-label={searchCollapsed ? "展开搜索区" : "收起搜索区"}
                onClick={() => setSearchCollapsed((collapsed) => !collapsed)}
              >
                <ChevronUp className={searchCollapsed ? "h-5 w-5 mobile-rotate" : "h-5 w-5"} />
              </button>
            ) : null}
            <button type="button" className="mobile-avatar-button" aria-label="退出登录" onClick={() => void signOut({ callbackUrl: "/" })}>
              {userAvatarUrl && !avatarFailed ? (
                <Image src={userAvatarUrl} alt={userName} width={36} height={36} className="rounded-full" unoptimized onError={() => setAvatarFailed(true)} />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {!isSettings && searchCollapsed ? (
          <button type="button" className="mobile-search-summary" onClick={() => setSearchCollapsed(false)}>
            <Search className="h-4 w-4" />
            <span>{workbench.submittedQuery || workbench.queryDraft || "搜索区已收起"}</span>
          </button>
        ) : null}

        {!isSettings && !searchCollapsed ? (
          <>
            <div className="mobile-search">
              <button
                type="button"
                className="mobile-search__go"
                aria-label="搜索仓库"
                disabled={!canSearch}
                onClick={actions.submitSearch}
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <input
                className="mobile-search__input"
                aria-label="搜索你的 Stars"
                role="searchbox"
                value={workbench.queryDraft}
                onChange={(event) => actions.setQueryDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSearch) actions.submitSearch();
                }}
                placeholder="搜索 Stars..."
              />
              <button
                type="button"
                className="mobile-search__ai"
                aria-label="AI 搜索"
                disabled={!canSearch || workbench.aiSearching}
                onClick={() => void actions.aiSearch()}
              >
                {workbench.aiSearching ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : <Sparkles className="h-[18px] w-[18px]" />}
              </button>
            </div>
            <div className="mobile-filterbar">
              <div className="mobile-field">
                <Hash className="h-4 w-4" />
                <input
                  className="mobile-field__input"
                  aria-label="按语言筛选"
                  placeholder="语言"
                  value={workbench.language}
                  onChange={(event) => actions.setLanguage(event.target.value)}
                  disabled={workbench.aiSearchMode}
                />
              </div>
              <div className="mobile-field">
                <Tag className="h-4 w-4" />
                <input
                  className="mobile-field__input"
                  aria-label="按标签筛选"
                  placeholder="标签"
                  value={workbench.tagFilter}
                  onChange={(event) => actions.setTagFilter(event.target.value)}
                  disabled={workbench.aiSearchMode}
                />
              </div>
              <button type="button" className="mobile-button mobile-button--ghost mobile-filterbar__clear" onClick={actions.clearFilters}>
                清空
              </button>
            </div>
          </>
        ) : null}
      </header>

      {workbench.error ? (
        <div className="mobile-status mobile-status--error" role="alert">
          <span>{workbench.error}</span>
          <button type="button" className="mobile-status__close" aria-label="关闭" onClick={() => actions.setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {workbench.message ? (
        <div className="mobile-status mobile-status--ok" role="status">
          <span>{workbench.message}</span>
          <button type="button" className="mobile-status__close" aria-label="关闭" onClick={() => actions.setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {isSettings ? (
        <MobileSettings
          section={workbench.settingsSection}
          providers={workbench.providers}
          tokens={workbench.tokens}
          onSectionChange={actions.setSettingsSection}
          onReload={() => void actions.loadSettings()}
          onError={actions.setError}
          onMessage={actions.setMessage}
        />
      ) : (
        <>
          <div className="mobile-listmeta">
            <span>
              {workbench.loadingRepos
                ? "正在加载仓库…"
                : `${workbench.repos.length} / ${workbench.total} 个仓库`}
            </span>
            {workbench.aiSearchMode ? <span className="mobile-listmeta__ai"><Sparkles className="h-3 w-3" />AI 排序</span> : null}
          </div>
          <section className="mobile-list" aria-label="仓库列表">
            {workbench.repos.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                selected={repo.id === workbench.selectedId}
                favoriteUpdating={workbench.favoriteUpdatingId === repo.id}
                onOpen={() => openRepo(repo)}
                onFavorite={() => void actions.toggleFavorite(repo)}
              />
            ))}
            {workbench.repos.length === 0 && !workbench.loadingRepos ? (
              <div className="mobile-empty">
                <span className="mobile-empty__icon">
                  <Star className="h-6 w-6" />
                </span>
                <strong>暂无仓库</strong>
                <p>同步 GitHub Stars，或调整筛选条件后再查看移动端工作台。</p>
              </div>
            ) : null}
          </section>
          <div className="mobile-load-more" ref={loadMoreRef}>
            {workbench.loadingMore ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                加载中
              </>
            ) : workbench.hasMore ? (
              "继续下滑加载"
            ) : workbench.repos.length > 0 ? (
              "已加载全部仓库"
            ) : null}
          </div>
        </>
      )}

      {showingDetail && workbench.selectedRepo ? (
        <RepoDetail
          repo={workbench.selectedRepo}
          noteDraft={workbench.noteDraft}
          newTag={workbench.newTag}
          favoriteUpdating={Boolean(workbench.favoriteUpdatingId === workbench.selectedRepo.id)}
          tagSubmitting={workbench.tagSubmitting}
          tagDeleting={workbench.tagDeleting}
          onClose={closeRepo}
          onFavorite={() => void actions.toggleFavorite(workbench.selectedRepo!)}
          onNoteChange={actions.changeNote}
          onSaveNote={() => void actions.saveNoteNow()}
          onNewTagChange={actions.setNewTag}
          onAddTag={() => void actions.addTag()}
          onDeleteTag={(tag) => void actions.deleteTag(tag)}
        />
      ) : null}

      <nav className="mobile-tabbar" aria-label="移动端工作台导航">
        {tabs.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            className={workbench.mode === mode ? "mobile-tab-button is-active" : "mobile-tab-button"}
            aria-current={workbench.mode === mode}
            onClick={() => actions.setMode(mode)}
          >
            <span className="mobile-tab-button__icon">
              <Icon className="h-4 w-4" />
            </span>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}
