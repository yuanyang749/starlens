"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { AiConfig, ProviderType, RepoSummary, TokenRecord } from "@starlens/core";
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
  { label: "OpenAI compatible", value: "openai_compatible" },
  { label: "Vercel AI Gateway", value: "vercel_gateway" },
  { label: "Anthropic native", value: "anthropic_native" },
  { label: "Gemini native", value: "gemini_native" },
];

const tabs: Array<{ mode: WorkbenchMode; label: string; icon: typeof Search }> = [
  { mode: "all", label: "Stars", icon: Search },
  { mode: "favorites", label: "Favorites", icon: Star },
  { mode: "recent", label: "Recent", icon: Home },
  { mode: "settings", label: "Settings", icon: Settings2 },
];

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
        <p className="mt-2">{summary || "No summary available."}</p>
      </button>
      <div className="mobile-repo-card__meta">
        <span>{formatCompactNumber(repo.stargazersCount)} stars</span>
        <span>{repo.language || "Unknown"}</span>
        <span>Updated {formatDateTime(repo.updatedAtGithub)}</span>
      </div>
      <div className="mobile-chip-row">
        {(repo.tags.length > 0 ? repo.tags : repo.topics).slice(0, 4).map((item) => (
          <span className="mobile-chip" key={item}>{item}</span>
        ))}
      </div>
      <div className="mobile-repo-card__actions">
        <button type="button" className="mobile-button" onClick={onOpen}>
          Details
        </button>
        <button
          type="button"
          className={repo.isFavorite ? "mobile-button mobile-button--primary" : "mobile-button"}
          disabled={favoriteUpdating}
          onClick={onFavorite}
          aria-label={repo.isFavorite ? "Favorited" : "Favorite"}
        >
          <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
          {repo.isFavorite ? "Saved" : "Save"}
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
  const summary = repoSummary(repo) || "README summary is not available yet.";

  return (
    <aside className="mobile-detail" aria-label="Selected repository">
      <div className="mobile-detail-header">
        <button type="button" className="mobile-icon-button" onClick={onClose} aria-label="Back to repositories">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <strong>Repository</strong>
        <button type="button" className="mobile-icon-button" onClick={onClose} aria-label="Close details">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mobile-detail-body">
        <section>
          <h1>{repo.fullName}</h1>
          <p className="mt-2">{repo.description}</p>
          <div className="mobile-repo-card__meta mt-3">
            <span>{formatCompactNumber(repo.stargazersCount)} stars</span>
            <span>{formatCompactNumber(repo.forksCount)} forks</span>
            <span>{repo.language || "Unknown"}</span>
          </div>
        </section>

        <section>
          <h2 className="mobile-section-title">Summary</h2>
          <p>{summary}</p>
        </section>

        <section>
          <h2 className="mobile-section-title">My note</h2>
          <textarea
            className="mobile-textarea"
            aria-label="My note"
            value={noteDraft}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <button type="button" className="mobile-button mt-2" onClick={onSaveNote}>
            <Check className="h-4 w-4" />
            Save note
          </button>
        </section>

        <section>
          <h2 className="mobile-section-title">Tags</h2>
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
              placeholder="New tag"
            />
            <button type="button" className="mobile-button" disabled={tagSubmitting} onClick={onAddTag}>
              <Tags className="h-4 w-4" />
              Add
            </button>
          </div>
        </section>

        <section>
          <h2 className="mobile-section-title">Actions</h2>
          <div className="mobile-detail-actions">
            <button
              type="button"
              className={repo.isFavorite ? "mobile-button mobile-button--primary" : "mobile-button"}
              disabled={favoriteUpdating}
              onClick={onFavorite}
            >
              <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {repo.isFavorite ? "Favorited" : "Favorite"}
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
                Homepage
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
      onMessage("Provider config saved.");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Failed to create provider.");
    }
  }

  async function validateProvider(id: string) {
    try {
      const result = await fetchApi<{ message: string; status: string }>(`/api/ai/configs/${id}/validate`, { method: "POST" });
      onMessage(result.message || `Validation ${result.status}.`);
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Failed to validate provider.");
    }
  }

  async function deleteProvider(id: string) {
    try {
      await fetchApi(`/api/ai/configs/${id}`, { method: "DELETE" });
      onMessage("Provider deleted.");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Failed to delete provider.");
    }
  }

  async function createToken() {
    const note = tokenNote.trim();
    if (!note) {
      onError("Remark is required.");
      return;
    }

    try {
      const token = await fetchApi<CreatedToken>("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Mobile token ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
          note,
        }),
      });
      if (token.token) {
        setCopyableTokens((current) => ({ ...current, [token.id]: token.token! }));
      }
      setTokenNote("");
      onMessage("Token created.");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Failed to create token.");
    }
  }

  async function revokeToken(id: string) {
    try {
      await fetchApi(`/api/tokens/${id}`, { method: "DELETE" });
      onMessage("Token revoked.");
      onReload();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Failed to revoke token.");
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
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {section === "general" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <strong>Interface language</strong>
            <p>English</p>
          </article>
          <article className="mobile-settings-item">
            <strong>Build information</strong>
            <p>Starlens Mobile 0.1.0</p>
          </article>
        </div>
      ) : null}

      {section === "providers" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <strong>New provider</strong>
            <div className="mt-3 grid gap-2">
              <input className="mobile-input" placeholder="Display name" value={providerForm.displayName} onChange={(event) => setProviderForm((current) => ({ ...current, displayName: event.target.value }))} />
              <select className="mobile-select" value={providerForm.providerType} onChange={(event) => setProviderForm((current) => ({ ...current, providerType: event.target.value as ProviderType }))}>
                {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input className="mobile-input" placeholder="Model" value={providerForm.model} onChange={(event) => setProviderForm((current) => ({ ...current, model: event.target.value }))} />
              <input className="mobile-input" placeholder="Base URL" value={providerForm.baseUrl} onChange={(event) => setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} />
              <input className="mobile-input" placeholder="API key" type="password" value={providerForm.apiKey} onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))} />
              <button type="button" className="mobile-button mobile-button--primary" onClick={createProvider}>
                <Bot className="h-4 w-4" />
                Create provider
              </button>
            </div>
          </article>
          {providers.map((provider) => (
            <article key={provider.id} className="mobile-settings-item">
              <strong>{provider.displayName}</strong>
              <p>{provider.providerType} · {provider.model}{provider.isDefault ? " · default" : ""}</p>
              <div className="mobile-detail-actions mt-3">
                <button type="button" className="mobile-button" onClick={() => validateProvider(provider.id)}>Validate</button>
                <button type="button" className="mobile-button" onClick={() => deleteProvider(provider.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {section === "tokens" ? (
        <div className="mobile-settings-list">
          <article className="mobile-settings-item">
            <strong>New token</strong>
            <div className="mt-3 grid gap-2">
              <input className="mobile-input" placeholder="Remark" value={tokenNote} onChange={(event) => setTokenNote(event.target.value)} />
              <button type="button" className="mobile-button mobile-button--primary" onClick={createToken}>
                <KeyRound className="h-4 w-4" />
                Create token
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
                    Copy
                  </button>
                ) : null}
                <button type="button" className="mobile-button" onClick={() => revokeToken(token.id)}>Revoke</button>
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
              aria-label={searchCollapsed ? "Expand search controls" : "Collapse search controls"}
              onClick={() => setSearchCollapsed((collapsed) => !collapsed)}
            >
              {searchCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
            <button type="button" className="mobile-icon-button" aria-label="Sign out" onClick={() => void signOut({ callbackUrl: "/" })}>
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
            <span>{workbench.submittedQuery || workbench.queryDraft || "Search controls hidden"}</span>
          </button>
        ) : (
          <>
            <div className="mobile-search">
              <input
                className="mobile-input"
                aria-label="Search your starred repositories"
                role="searchbox"
                value={workbench.queryDraft}
                onChange={(event) => actions.setQueryDraft(event.target.value)}
                placeholder="Search stars..."
              />
              <button type="button" className="mobile-icon-button" aria-label="Search repositories" disabled={!canSearch} onClick={actions.submitSearch}>
                <Search className="h-5 w-5" />
              </button>
              <button type="button" className="mobile-icon-button mobile-icon-button--primary" aria-label="AI Search" disabled={!canSearch || workbench.aiSearching} onClick={() => void actions.aiSearch()}>
                {workbench.aiSearching ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </button>
            </div>
            <div className="mobile-actions">
              <button type="button" className="mobile-button mobile-button--primary" disabled={workbench.syncing} onClick={() => void actions.syncNow()}>
                <RefreshCw className={workbench.syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {workbench.syncing ? "Syncing" : "Sync"}
              </button>
              <button type="button" className="mobile-button" onClick={actions.clearFilters}>Clear</button>
            </div>
            <div className="mobile-filter-grid">
              <input className="mobile-input" aria-label="Filter by language" placeholder="Language" value={workbench.language} onChange={(event) => actions.setLanguage(event.target.value)} disabled={workbench.aiSearchMode} />
              <input className="mobile-input" aria-label="Filter by tag" placeholder="Tag" value={workbench.tagFilter} onChange={(event) => actions.setTagFilter(event.target.value)} disabled={workbench.aiSearchMode} />
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
              ? "Loading repositories..."
              : `${workbench.repos.length} of ${workbench.total} repositories loaded`}
          </div>
          <section className="mobile-list" aria-label="Repositories">
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
                <strong>No repositories</strong>
                <p>Sync GitHub Stars or adjust filters to populate the mobile workbench.</p>
              </div>
            ) : null}
          </section>
          <div className="mobile-load-more" ref={loadMoreRef}>
            {workbench.loadingMore ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading more
              </>
            ) : workbench.hasMore ? (
              "Scroll for more"
            ) : workbench.repos.length > 0 ? (
              "All repositories loaded"
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

      <nav className="mobile-tabbar" aria-label="Mobile workbench navigation">
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
