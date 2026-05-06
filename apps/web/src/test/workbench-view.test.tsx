/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginatedResult, RepoSummary } from "@starlens/core";
import { mockRepoDetails } from "@starlens/core";
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
  act(() => root.render(node));
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

beforeEach(() => {
  replaceMock.mockReset();
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
    expect(el.textContent).toContain("Filters");
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
});
