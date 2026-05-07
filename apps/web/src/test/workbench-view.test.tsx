/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginatedResult, RepoSummary } from "@starlens/core";
import { mockRepoDetails } from "@starlens/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkbenchView } from "@/components/workbench-view";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<TooltipProvider>{node}</TooltipProvider>));
  return { el, root };
}

async function flushWorkbench() {
  await act(async () => Promise.resolve());
  await act(async () => Promise.resolve());
}

function createSearchPayload(items: RepoSummary[]): PaginatedResult<RepoSummary> {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    hasMore: false,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  replaceMock.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.startsWith("/api/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: createSearchPayload(mockRepoDetails.slice(0, 3)) }),
          ),
        );
      }

      if (url === "/api/repos/repo-1") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: mockRepoDetails[0] })),
        );
      }

      if (url === "/api/repos/repo-1" && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: mockRepoDetails[0] })),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: { status: "success", counts: { fetched: 3, unstarred: 0 } } })),
      );
    }),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("workbench view", () => {
  it("renders the desktop workbench shell and key actions", async () => {
    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    expect(el.textContent).toContain("WORKBENCH");
    expect(el.textContent).toContain("DISCOVER");
    expect(el.textContent).toContain("Repository");
    expect(el.textContent).toContain("Selected repository");
    expect(el.textContent).toContain("AI Search");
    expect(el.textContent).toContain("Search");
  });

  it("keeps favorite and note controls available for the selected repo", async () => {
    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    const favoriteButton = Array.from(el.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.match(/favorite|favorited/i) ||
      button.textContent?.match(/favorite|favorited/i),
    );
    const noteBox = Array.from(el.querySelectorAll("textarea")).find(
      (node) => node.getAttribute("aria-label") === "My note",
    );

    expect(favoriteButton).toBeTruthy();
    expect(noteBox).toBeTruthy();
    expect(el.textContent).toContain("Open on GitHub");
  });

  it("shows loading state for AI Search after clicking the button", async () => {
    let resolveAiSearch: ((value: Response) => void) | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("/api/search")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ ok: true, data: createSearchPayload(mockRepoDetails.slice(0, 3)) }),
            ),
          );
        }

        if (url === "/api/repos/repo-1") {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true, data: mockRepoDetails[0] })),
          );
        }

        if (url === "/api/ai/ask" && init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            resolveAiSearch = resolve;
          });
        }

        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: { status: "success", counts: { fetched: 3, unstarred: 0 } } })),
        );
      }),
    );

    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    const searchBox = el.querySelector('input[role="searchbox"]') as HTMLInputElement | null;
    const aiSearchButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "AI Search",
    ) as HTMLButtonElement | undefined;

    expect(searchBox).toBeTruthy();
    expect(aiSearchButton).toBeTruthy();

    await act(async () => {
      setInputValue(searchBox!, "repo-1");
      await Promise.resolve();
    });

    await act(async () => {
      aiSearchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(aiSearchButton?.disabled).toBe(true);
    expect(aiSearchButton?.getAttribute("aria-busy")).toBe("true");
    expect(aiSearchButton?.textContent).toContain("Searching");

    await act(async () => {
      resolveAiSearch?.(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              answer: "Matched repo-1",
              candidates: [{ id: "repo-1", fullName: mockRepoDetails[0]?.fullName ?? "repo-1" }],
              providerConfigId: null,
            },
          }),
        ),
      );
      await Promise.resolve();
    });

    await flushWorkbench();
  });

  it("shows custom tags and places sync action inside repo filters", async () => {
    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    const repoPane = el.querySelector('[data-testid="repo-table-pane"]');
    const listFilterInput = repoPane?.querySelector('input[aria-label="Filter repositories"]');
    const rowTags = Array.from(repoPane?.querySelectorAll(".repo-table-row .repo-chip") ?? []);
    const headerText = repoPane?.querySelector(".repo-table-pane__header")?.textContent ?? "";
    const syncButton = repoPane?.querySelector('.repo-table-pane__filters button[aria-label="Sync now"]');
    const topbarSyncButton = el.querySelector('[data-testid="workbench-topbar"] button[aria-label="Sync now"]');

    expect(repoPane).toBeTruthy();
    expect(listFilterInput).toBeNull();
    expect(syncButton).toBeTruthy();
    expect(topbarSyncButton).toBeNull();
    expect(headerText).toContain("Actions");
    expect(headerText).toContain("Tags");
    expect(rowTags.length).toBeGreaterThan(0);
    expect(rowTags.some((chip) => chip.textContent?.includes("frontend"))).toBe(true);
  });

  it("does not request search while typing and only searches on manual submit", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.startsWith("/api/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: createSearchPayload(mockRepoDetails.slice(0, 3)) }),
          ),
        );
      }

      if (url === "/api/repos/repo-1") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: mockRepoDetails[0] })),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: { status: "success", counts: { fetched: 3, unstarred: 0 } } })),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    const initialSearchCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).startsWith("/api/search"),
    ).length;
    const searchBox = el.querySelector('input[role="searchbox"]') as HTMLInputElement | null;
    const searchButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Search repositories",
    ) as HTMLButtonElement | undefined;

    expect(searchBox).toBeTruthy();
    expect(searchButton).toBeTruthy();

    await act(async () => {
      setInputValue(searchBox!, "typescript");
      await Promise.resolve();
    });

    const typingSearchCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).startsWith("/api/search"),
    ).length;
    expect(typingSearchCalls).toBe(initialSearchCalls);

    await act(async () => {
      searchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await flushWorkbench();

    const afterSubmitCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).startsWith("/api/search"),
    ).length;
    expect(afterSubmitCalls).toBeGreaterThan(typingSearchCalls);
  });

  it("does not allow empty search actions and removes inert topbar buttons", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.startsWith("/api/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: createSearchPayload(mockRepoDetails.slice(0, 3)) }),
          ),
        );
      }

      if (url === "/api/repos/repo-1") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: mockRepoDetails[0] })),
        );
      }

      if (url === "/api/ai/ask") {
        throw new Error("AI search should not run without input");
      }

      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: { status: "success", counts: { fetched: 3, unstarred: 0 } } })),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    const searchButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Search repositories",
    ) as HTMLButtonElement | undefined;
    const aiSearchButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "AI Search",
    ) as HTMLButtonElement | undefined;

    expect(searchButton?.disabled).toBe(true);
    expect(aiSearchButton?.disabled).toBe(true);
    expect(el.textContent).not.toContain("Filters");
    expect(el.querySelector('button[aria-label="Settings"]')).toBeNull();
    expect(el.querySelector('button[aria-label="Notifications"]')).toBeNull();

    const aiAskCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()) === "/api/ai/ask",
    ).length;
    expect(aiAskCalls).toBe(0);
  });

  it("shows custom action tooltips and lets row actions toggle favorite or open details", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const repoMatch = url.match(/^\/api\/repos\/(repo-\d+)$/);

      if (url.startsWith("/api/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: createSearchPayload(mockRepoDetails.slice(0, 3)) }),
          ),
        );
      }

      if (repoMatch) {
        const repo = mockRepoDetails.find((item) => item.id === repoMatch[1]);
        if (!repo) {
          throw new Error(`Unknown repo ${repoMatch[1]}`);
        }

        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body ?? "{}")) as Partial<RepoSummary>;
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true, data: { ...repo, ...body } })),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: repo })),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: { status: "success", counts: { fetched: 3, unstarred: 0 } } })),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { el } = mount(<WorkbenchView userName="Tester" />);
    await flushWorkbench();

    const rows = Array.from(el.querySelectorAll(".repo-table-row"));
    const firstRowFavorite = rows[0]?.querySelector('button[aria-label*="收藏"]') as HTMLButtonElement | null;
    const secondRowDetails = rows[1]?.querySelector('button[aria-label="查看详情"]') as HTMLButtonElement | null;

    expect(firstRowFavorite?.getAttribute("title")).toBeNull();
    expect(secondRowDetails?.getAttribute("title")).toBeNull();

    await act(async () => {
      firstRowFavorite?.focus();
      firstRowFavorite?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("取消收藏");

    await act(async () => {
      firstRowFavorite?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await flushWorkbench();

    await act(async () => {
      firstRowFavorite?.focus();
      firstRowFavorite?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("加入收藏");

    await act(async () => {
      secondRowDetails?.focus();
      secondRowDetails?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("查看详情");

    await act(async () => {
      secondRowDetails?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await flushWorkbench();

    expect(el.textContent).toContain(mockRepoDetails[1]?.fullName ?? "");
  });
});
