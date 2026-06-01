import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiConfig, PaginatedResult, RepoSummary, TokenRecord } from "@starlens/core";
import { useMobileWorkbench, type AiAskResult, type SyncResult } from "./index";

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
    repoSummary: "A repository search workbench.",
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
    watchersCount: 30,
    homepage: "",
    isFavorite: false,
    tags: ["tool"],
    note: "",
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

const repoOne = repoFixture();
const repoTwo = repoFixture({
  id: "repo-2",
  githubRepoId: 2,
  name: "vector-db",
  fullName: "acme/vector-db",
  stargazersCount: 980,
  tags: ["ai"],
});

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
  name: "Mobile",
  note: "phone",
  tokenPrefix: "stars_abc",
  tokenSuffix: "xyz123",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-05-28T00:00:00.000Z",
};

function apiResponse<T>(data: T): Response {
  return {
    status: 200,
    json: async () => ({ ok: true, data }),
  } as Response;
}

function paginated(items: RepoSummary[], page = 1, total = items.length): PaginatedResult<RepoSummary> {
  return {
    items,
    page,
    pageSize: 20,
    total,
    hasMore: page * 20 < total,
  };
}

function syncFixture(): SyncResult {
  return {
    status: "success",
    startedAt: "2026-05-28T00:00:00.000Z",
    finishedAt: "2026-05-28T00:00:01.000Z",
    durationMs: 1000,
    pageCount: 1,
    failedCount: 0,
    errorSummary: null,
    errorLevel: null,
    counts: {
      fetched: 2,
      insertedOrUpdated: 2,
      unstarred: 0,
    },
    history: [],
  };
}

let roots: Root[] = [];
let repos: Record<string, RepoSummary>;
let fetchMock: ReturnType<typeof vi.fn>;

function renderHook() {
  let current: ReturnType<typeof useMobileWorkbench> | undefined;
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);

  function Harness() {
    current = useMobileWorkbench();
    return <div data-testid="count">{current.repos.length}</div>;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    get current() {
      if (!current) throw new Error("Hook did not render.");
      return current;
    },
  };
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (caught) {
      lastError = caught;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

beforeEach(() => {
  repos = {
    [repoOne.id]: repoFixture(),
    [repoTwo.id]: repoFixture({
      id: "repo-2",
      githubRepoId: 2,
      name: "vector-db",
      fullName: "acme/vector-db",
      stargazersCount: 980,
      tags: ["ai"],
    }),
  };

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(requestUrl, "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/search") {
      const page = Number(url.searchParams.get("page") ?? "1");
      return apiResponse(page === 1
        ? paginated([repos[repoOne.id]], 1, 21)
        : paginated([repos[repoTwo.id]], 2, 21));
    }

    if (url.pathname === "/api/sync" && method === "POST") {
      return apiResponse(syncFixture());
    }

    if (url.pathname === "/api/ai/ask" && method === "POST") {
      return apiResponse<AiAskResult>({
        answer: "Vector database repositories are the best match.",
        providerConfigId: providerFixture.id,
        candidates: [{ id: repoTwo.id, fullName: repoTwo.fullName, reason: "semantic match" }],
      });
    }

    if (url.pathname === "/api/ai/configs") {
      return apiResponse([providerFixture]);
    }

    if (url.pathname === "/api/tokens") {
      return apiResponse([tokenFixture]);
    }

    const repoMatch = url.pathname.match(/^\/api\/repos\/([^/]+)$/);
    if (repoMatch?.[1]) {
      const id = decodeURIComponent(repoMatch[1]);
      if (method === "PATCH") {
        const updates = JSON.parse(String(init?.body ?? "{}")) as Partial<RepoSummary>;
        repos[id] = { ...repos[id], ...updates };
      }
      return apiResponse(repos[id]);
    }

    const tagsMatch = url.pathname.match(/^\/api\/repos\/([^/]+)\/tags(?:\/([^/]+))?$/);
    if (tagsMatch?.[1]) {
      const id = decodeURIComponent(tagsMatch[1]);
      if (method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as { tag: string };
        repos[id] = { ...repos[id], tags: [...repos[id].tags, payload.tag] };
      }
      if (method === "DELETE" && tagsMatch[2]) {
        const tag = decodeURIComponent(tagsMatch[2]);
        repos[id] = { ...repos[id], tags: repos[id].tags.filter((item) => item !== tag) };
      }
      return apiResponse({ tags: repos[id].tags });
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`);
  });

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  roots = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useMobileWorkbench", () => {
  it("loads repositories and sends submitted search params", async () => {
    const hook = renderHook();

    await waitFor(() => expect(hook.current.repos).toHaveLength(1));

    act(() => hook.current.actions.setQueryDraft("vector db"));
    act(() => hook.current.actions.submitSearch());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("q=vector+db"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(hook.current.submittedQuery).toBe("vector db");
  });

  it("handles sync, favorite, note, and tags", async () => {
    const hook = renderHook();

    await waitFor(() => expect(hook.current.selectedRepo?.id).toBe(repoOne.id));

    await act(async () => {
      await hook.current.actions.syncNow();
    });
    expect(hook.current.lastSync?.counts.fetched).toBe(2);

    await act(async () => {
      await hook.current.actions.toggleFavorite(hook.current.repos[0]);
    });
    await waitFor(() => expect(hook.current.selectedRepo?.isFavorite).toBe(true));

    act(() => hook.current.actions.changeNote("mobile note"));
    await waitFor(() => expect(hook.current.noteDraft).toBe("mobile note"));
    await act(async () => {
      await hook.current.actions.saveNoteNow();
    });
    expect(repos[repoOne.id].note).toBe("mobile note");

    act(() => hook.current.actions.setNewTag("mobile"));
    await act(async () => {
      await hook.current.actions.addTag();
    });
    await waitFor(() => expect(hook.current.selectedRepo?.tags).toContain("mobile"));

    await act(async () => {
      await hook.current.actions.deleteTag("mobile");
    });
    await waitFor(() => expect(hook.current.selectedRepo?.tags).not.toContain("mobile"));
  });

  it("loads the next repository page without replacing existing results", async () => {
    const hook = renderHook();

    await waitFor(() => expect(hook.current.repos.map((repo) => repo.id)).toEqual([repoOne.id]));

    await act(async () => {
      await hook.current.actions.loadMore();
    });

    await waitFor(() => {
      expect(hook.current.repos.map((repo) => repo.id)).toEqual([repoOne.id, repoTwo.id]);
    });
    expect(hook.current.page).toBe(2);
    expect(hook.current.hasMore).toBe(false);
  });

  it("runs AI search and loads settings data", async () => {
    const hook = renderHook();

    await waitFor(() => expect(hook.current.repos).toHaveLength(1));

    act(() => hook.current.actions.setQueryDraft("which vector database"));
    await act(async () => {
      await hook.current.actions.aiSearch();
    });

    await waitFor(() => expect(hook.current.aiSearchMode).toBe(true));
    expect(hook.current.repos[0].id).toBe(repoTwo.id);
    expect(hook.current.message).toContain("Vector database");

    act(() => hook.current.actions.setMode("settings"));
    await waitFor(() => expect(hook.current.providers).toEqual([providerFixture]));
    expect(hook.current.tokens).toEqual([tokenFixture]);
  });
});
