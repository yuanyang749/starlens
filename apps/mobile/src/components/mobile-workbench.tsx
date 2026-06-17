"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { AiConfig, ProviderType, RepoSummary, TokenRecord } from "@starlens-app/core";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  Github,
  Home,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Star,
  Tags,
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
  { mode: "recent", label: "最近", icon: Home },
  { mode: "settings", label: "设置", icon: Settings2 },
];

const settingsSectionLabels: Record<SettingsSection, string> = {
  general: "通用",
  providers: "AI Provider",
  tokens: "API Token",
};

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

  return (
    <article className={selected ? "mobile-repo-card is-selected" : "mobile-repo-card"}>
      <button type="button" className="text-left" onClick={onOpen}>
        <h2>{repo.fullName}</h2>
        <p className="mt-2">{summary || "暂无摘要。"}</p>
      </button>
      <div className="mobile-repo-card__meta">
        <span>{formatCompactNumber(repo.stargazersCount)} Stars</span>
        <span>{repo.language || "未知"}</span>
        <span>更新 {formatDateTime(repo.updatedAtGithub)}</span>
      </div>
      <div className="mobile-chip-row">
        {(repo.tags.length > 0 ? repo.tags : repo.topics).slice(0, 4).map((item) => (
          <span className="mobile-chip" key={item}>{item}</span>
        ))}
      </div>
      <div className="mobile-repo-card__actions">
        <button type="button" className="mobile-button" onClick={onOpen}>
          详情
        </button>
        <button
          type="button"
          className={repo.isFavorite ? "mobile-button mobile-button--primary" : "mobile-button"}
          disabled={favoriteUpdating}
          onClick={onFavorite}
          aria-label={repo.isFavorite ? "已重点收藏" : "重点收藏"}
        >
          <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
          {repo.isFavorite ? "已收藏" : "收藏"}
        </button>
      </div>
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
        <section>
          <h1>{repo.fullName}</h1>
          <p className="mt-2">{repo.description}</p>
          <div className="mobile-repo-card__meta mt-3">
            <span>{formatCompactNumber(repo.stargazersCount)} Stars</span>
            <span>{formatCompactNumber(repo.forksCount)} Forks</span>
            <span>{repo.language || "未知"}</span>
          </div>
        </section>

        <section>
          <h2 className="mobile-section-title">摘要</h2>
          <p>{summary}</p>
        </section>

        <section>
          <h2 className="mobile-section-title">我的备注</h2>
          <textarea
            className="mobile-textarea"
            aria-label="我的备注"
            value={noteDraft}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <button type="button" className="mobile-button mt-2" onClick={onSaveNote}>
            <Check className="h-4 w-4" />
            保存备注
          </button>
        </section>

        <section>
          <h2 className="mobile-section-title">标签</h2>
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
          <div className="mobile-tag-editor mt-2">
            <input
              className="mobile-input"
              value={newTag}
              onChange={(event) => onNewTagChange(event.target.value)}
              placeholder="新标签"
            />
            <button type="button" className="mobile-button" disabled={tagSubmitting} onClick={onAddTag}>
              <Tags className="h-4 w-4" />
              添加
            </button>
          </div>
        </section>

        <section>
          <h2 className="mobile-section-title">操作</h2>
          <div className="mobile-detail-actions">
            <button
              type="button"
              className={repo.isFavorite ? "mobile-button mobile-button--primary" : "mobile-button"}
              disabled={favoriteUpdating}
              onClick={onFavorite}
            >
              <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {repo.isFavorite ? "已重点收藏" : "重点收藏"}
            </button>
            {githubUrl ? (
              <a className="mobile-button" href={githubUrl} target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4" />
                GitHub
              </a>
            ) : null}
            {homepageUrl ? (
              <a className="mobile-button" href={homepageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                主页
              </a>
            ) : null}
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
      <div className="mobile-setting-tabs">
        {(["general", "providers", "tokens"] as SettingsSection[]).map((item) => (
          <button
            key={item}
            type="button"
            className={section === item ? "mobile-button is-active" : "mobile-button"}
            onClick={() => onSectionChange(item)}
          >
            {settingsSectionLabels[item]}
          </button>
        ))}
      </div>

      {section === "general" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <strong>界面语言</strong>
            <p>简体中文</p>
          </article>
          <article className="mobile-settings-item">
            <strong>构建信息</strong>
            <p>Starlens Mobile 0.1.0</p>
          </article>
        </div>
      ) : null}

      {section === "providers" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <strong>新建 Provider</strong>
            <div className="mt-3 grid gap-2">
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
            <article key={provider.id} className="mobile-settings-item">
              <strong>{provider.displayName}</strong>
              <p>{provider.providerType} · {provider.model}{provider.isDefault ? " · 默认" : ""}</p>
              <div className="mobile-detail-actions mt-3">
                <button type="button" className="mobile-button" onClick={() => validateProvider(provider.id)}>验证</button>
                <button type="button" className="mobile-button" onClick={() => deleteProvider(provider.id)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {section === "tokens" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <strong>新建 Token</strong>
            <div className="mt-3 grid gap-2">
              <input className="mobile-input" placeholder="用途备注" value={tokenNote} onChange={(event) => setTokenNote(event.target.value)} />
              <button type="button" className="mobile-button mobile-button--primary" onClick={createToken}>
                <KeyRound className="h-4 w-4" />
                创建 Token
              </button>
            </div>
          </article>
          {tokens.map((token) => (
            <article key={token.id} className="mobile-settings-item">
              <strong>{token.name}</strong>
              {token.note ? <p>{token.note}</p> : null}
              <p className="font-mono">{maskToken(token, copyableTokens[token.id])}</p>
              <div className="mobile-detail-actions mt-3">
                {copyableTokens[token.id] ? (
                  <button
                    type="button"
                    className="mobile-button"
                    onClick={() => navigator.clipboard.writeText(copyableTokens[token.id])}
                  >
                    复制
                  </button>
                ) : null}
                <button type="button" className="mobile-button" onClick={() => revokeToken(token.id)}>撤销</button>
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

  return (
    <main className="mobile-shell">
      <header className={searchCollapsed ? "mobile-topbar is-collapsed" : "mobile-topbar"}>
        <div className="mobile-title-row">
          <div className="mobile-brand">
            <strong>Starlens</strong>
            <span>{userName}</span>
          </div>
          <div className="mobile-title-actions">
            <button
              type="button"
              className="mobile-icon-button"
              aria-expanded={!searchCollapsed}
              aria-label={searchCollapsed ? "展开搜索区" : "收起搜索区"}
              onClick={() => setSearchCollapsed((collapsed) => !collapsed)}
            >
              {searchCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
            <button type="button" className="mobile-icon-button" aria-label="退出登录" onClick={() => void signOut({ callbackUrl: "/" })}>
              {userAvatarUrl && !avatarFailed ? (
                <Image src={userAvatarUrl} alt={userName} width={32} height={32} className="rounded-full" unoptimized onError={() => setAvatarFailed(true)} />
              ) : (
                <X className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        {searchCollapsed ? (
          <button type="button" className="mobile-search-summary" onClick={() => setSearchCollapsed(false)}>
            <Search className="h-4 w-4" />
            <span>{workbench.submittedQuery || workbench.queryDraft || "搜索区已收起"}</span>
          </button>
        ) : (
          <>
            <div className="mobile-search">
              <input
                className="mobile-input"
                aria-label="搜索你的 Stars"
                role="searchbox"
                value={workbench.queryDraft}
                onChange={(event) => actions.setQueryDraft(event.target.value)}
                placeholder="搜索 Stars..."
              />
              <button type="button" className="mobile-icon-button" aria-label="搜索仓库" disabled={!canSearch} onClick={actions.submitSearch}>
                <Search className="h-5 w-5" />
              </button>
              <button type="button" className="mobile-icon-button mobile-icon-button--primary" aria-label="AI 搜索" disabled={!canSearch || workbench.aiSearching} onClick={() => void actions.aiSearch()}>
                {workbench.aiSearching ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </button>
            </div>
            <div className="mobile-actions">
              <button type="button" className="mobile-button mobile-button--primary" disabled={workbench.syncing} onClick={() => void actions.syncNow()}>
                <RefreshCw className={workbench.syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {workbench.syncing ? "同步中" : "同步"}
              </button>
              <button type="button" className="mobile-button" onClick={actions.clearFilters}>清空</button>
            </div>
            <div className="mobile-filter-grid">
              <input className="mobile-input" aria-label="按语言筛选" placeholder="语言" value={workbench.language} onChange={(event) => actions.setLanguage(event.target.value)} disabled={workbench.aiSearchMode} />
              <input className="mobile-input" aria-label="按标签筛选" placeholder="标签" value={workbench.tagFilter} onChange={(event) => actions.setTagFilter(event.target.value)} disabled={workbench.aiSearchMode} />
            </div>
          </>
        )}
      </header>

      {workbench.error ? <div className="mobile-status mobile-status--error" role="alert">{workbench.error}</div> : null}
      {workbench.message ? <div className="mobile-status" role="status">{workbench.message}</div> : null}

      {workbench.mode === "settings" ? (
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
          <div className="mobile-status">
            {workbench.loadingRepos
              ? "正在加载仓库..."
              : `${workbench.repos.length} / ${workbench.total} 个仓库已加载`}
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
            {workbench.repos.length === 0 ? (
              <div className="mobile-empty">
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
            onClick={() => actions.setMode(mode)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}
