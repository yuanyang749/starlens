import { act, type ImgHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiConfig, RepoSummary, TokenRecord } from "@starlens/core";
import type { useMobileWorkbench } from "@starlens/workbench";
import { MobileWorkbench } from "../components/mobile-workbench";

type WorkbenchState = ReturnType<typeof useMobileWorkbench>;

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  repoParam: "",
  workbench: null as WorkbenchState | null,
  fetchApi: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.repoParam ? `repo=${mocks.repoParam}` : ""),
}));

vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => {
    // 测试环境不需要 Next Image 优化，只验证移动端头像渲染路径。
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ""} />;
  },
}));

vi.mock("@starlens/workbench", async () => ({
  fetchApi: mocks.fetchApi,
  useMobileWorkbench: () => {
    if (!mocks.workbench) throw new Error("Workbench mock was not configured.");
    return mocks.workbench;
  },
}));

function repoFixture(overrides: Partial<RepoSummary> = {}): RepoSummary {
  const now = "2026-05-28T00:00:00.000Z";
  return {
    id: "repo-1",
    githubRepoId: 1,
    name: "starlens",
    fullName: "acme/starlens",
    ownerLogin: "acme",
    ownerAvatarUrl: "",
    htmlUrl: "https://github.com/acme/starlens",
    description: "Search starred repositories.",
    repoSummary: "A mobile-ready workbench.",
    readmeExcerpt: "",
    language: "TypeScript",
    topics: ["search", "stars"],
    stargazersCount: 1200,
    forksCount: 42,
    openIssuesCount: 3,
    defaultBranch: "main",
    licenseName: "MIT",
    license: { key: "mit", name: "MIT" },
    visibility: "public",
    archived: false,
    disabled: false,
    isFork: false,
    watchersCount: 20,
    homepage: "https://starlens.dev",
    isFavorite: false,
    tags: ["tool"],
    note: "Keep an eye on mobile UX.",
    createdAtGithub: now,
    updatedAtGithub: now,
    pushedAtGithub: now,
    starredAtGithub: now,
    lastSyncedAt: now,
    repoSummarySource: "github_description",
    repoSummaryUpdatedAt: now,
    readmeExcerptSource: "github_readme_excerpt",
    readmeExcerptUpdatedAt: now,
    searchDocumentSource: "repo_metadata",
    searchDocumentUpdatedAt: now,
    ...overrides,
  };
}

const providerFixture: AiConfig = {
  id: "provider-1",
  displayName: "OpenAI",
  providerType: "openai_compatible",
  model: "gpt-4.1",
  baseUrl: null,
  enabled: true,
  isDefault: true,
  lastValidatedAt: null,
  lastValidationStatus: null,
  lastValidationError: null,
};

const tokenFixture: TokenRecord = {
  id: "token-1",
  name: "Mobile token",
  note: "phone",
  tokenPrefix: "stars_abc",
  tokenSuffix: "xyz123",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-05-28T00:00:00.000Z",
};

function actionsFixture(): WorkbenchState["actions"] {
  return {
    setMode: vi.fn(),
    setSettingsSection: vi.fn(),
    setQueryDraft: vi.fn(),
    submitSearch: vi.fn(),
    aiSearch: vi.fn(),
    syncNow: vi.fn(),
    setLanguage: vi.fn(),
    setTagFilter: vi.fn(),
    setSort: vi.fn(),
    setPage: vi.fn(),
    loadMore: vi.fn(),
    clearFilters: vi.fn(),
    setSelectedId: vi.fn(),
    setError: vi.fn(),
    setMessage: vi.fn(),
    toggleFavorite: vi.fn(),
    changeNote: vi.fn(),
    saveNoteNow: vi.fn(),
    setNewTag: vi.fn(),
    addTag: vi.fn(),
    deleteTag: vi.fn(),
    loadSettings: vi.fn(),
  };
}

function workbenchFixture(overrides: Partial<WorkbenchState> = {}): WorkbenchState {
  const repo = repoFixture();
  return {
    mode: "all",
    settingsSection: "general",
    queryDraft: "starlens",
    submittedQuery: "",
    language: "",
    tagFilter: "",
    sort: "recent",
    page: 1,
    pageSize: 20,
    repos: [repo],
    total: 1,
    totalPages: 1,
    selectedId: repo.id,
    selectedRepo: repo,
    noteDraft: repo.note,
    newTag: "",
    error: null,
    message: null,
    lastSync: null,
    syncing: false,
    loadingRepos: false,
    loadingMore: false,
    aiSearching: false,
    aiSearchMode: false,
    hasMore: false,
    favoriteUpdatingId: null,
    tagSubmitting: false,
    tagDeleting: null,
    providers: [providerFixture],
    tokens: [tokenFixture],
    actions: actionsFixture(),
    ...overrides,
  };
}

let roots: Root[] = [];

function renderMobile() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  const rerender = () => {
    act(() => {
      root.render(<MobileWorkbench userName="Ada" userAvatarUrl={null} />);
    });
  };

  rerender();
  return { container, rerender };
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  }

  mocks.push.mockReset();
  mocks.signOut.mockReset();
  mocks.fetchApi.mockReset();
  mocks.repoParam = "";
  mocks.workbench = workbenchFixture();
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  roots = [];
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("MobileWorkbench", () => {
  it("renders bottom tabs, search controls, and repository cards", () => {
    const { container } = renderMobile();

    expect(container.textContent).toContain("Stars");
    expect(container.textContent).toContain("Favorites");
    expect(container.textContent).toContain("Recent");
    expect(container.textContent).toContain("Settings");
    expect(container.textContent).toContain("acme/starlens");
    expect(container.querySelector('[role="searchbox"]')).not.toBeNull();

    const favoritesTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Favorites",
    );
    expect(favoritesTab).toBeTruthy();
    click(favoritesTab!);
    expect(mocks.workbench?.actions.setMode).toHaveBeenCalledWith("favorites");

    const detailsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Details",
    );
    expect(detailsButton).toBeTruthy();
    click(detailsButton!);
    expect(mocks.push).toHaveBeenCalledWith("/?repo=repo-1", { scroll: false });
  });

  it("collapses and expands the top search controls", () => {
    const { container } = renderMobile();

    const collapseButton = container.querySelector('button[aria-label="Collapse search controls"]');
    expect(collapseButton).not.toBeNull();
    click(collapseButton!);
    expect(container.querySelector('[role="searchbox"]')).toBeNull();
    expect(container.textContent).toContain("starlens");

    const summaryButton = container.querySelector(".mobile-search-summary");
    expect(summaryButton).not.toBeNull();
    click(summaryButton!);
    expect(container.querySelector('[role="searchbox"]')).not.toBeNull();
  });

  it("opens and closes repository detail from the repo search param", () => {
    mocks.repoParam = "repo-1";
    const { container } = renderMobile();

    expect(container.textContent).toContain("Repository");
    expect(container.textContent).toContain("My note");
    expect(container.textContent).toContain("Tags");

    const closeButton = container.querySelector('button[aria-label="Close details"]');
    expect(closeButton).not.toBeNull();
    click(closeButton!);
    expect(mocks.push).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("switches settings sections inside the Settings tab", () => {
    mocks.workbench = workbenchFixture({ mode: "settings", settingsSection: "general" });
    const { container, rerender } = renderMobile();

    expect(container.textContent).toContain("Interface language");
    expect(container.textContent).toContain("Build information");

    const providersButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Providers",
    );
    expect(providersButton).toBeTruthy();
    click(providersButton!);
    expect(mocks.workbench?.actions.setSettingsSection).toHaveBeenCalledWith("providers");

    mocks.workbench = workbenchFixture({ mode: "settings", settingsSection: "providers" });
    rerender();
    expect(container.textContent).toContain("New provider");
    expect(container.textContent).toContain("OpenAI");

    const tokensButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Tokens",
    );
    expect(tokensButton).toBeTruthy();
    click(tokensButton!);
    expect(mocks.workbench?.actions.setSettingsSection).toHaveBeenCalledWith("tokens");

    mocks.workbench = workbenchFixture({ mode: "settings", settingsSection: "tokens" });
    rerender();
    expect(container.textContent).toContain("New token");
    expect(container.textContent).toContain("Mobile token");
  });
});
