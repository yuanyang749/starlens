/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/workbench/dashboard-view";

const roots: Root[] = [];

function mount(node: React.ReactNode) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const root = createRoot(element);
  act(() => root.render(node));
  roots.push(root);
  return element;
}

async function flushDashboard() {
  await act(async () => Promise.resolve());
  await act(async () => Promise.resolve());
}

beforeEach(() => {
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
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              total: 170,
              byLanguage: [
                { language: "TypeScript", count: 42 },
                { language: "Python", count: 40 },
              ],
              totalFavorites: 5,
              recentAdded: 12,
              attention: { total: 28, stale: 16, archived: 2, untagged: 11, missingMetadata: 3 },
              attentionRepos: [
                {
                  id: "repo-1",
                  fullName: "owner/old-repo",
                  language: "TypeScript",
                  stargazersCount: 1200,
                  pushedAtGithub: "2022-01-01T00:00:00.000Z",
                  reasons: ["长期未更新", "未分类"],
                },
              ],
              lastSyncedAt: "2026-07-13T06:30:00.000Z",
              mostStarredRepo: { fullName: "owner/popular", stargazersCount: 100000 },
              monthlyTrend: [
                { month: "2026-06", count: 5 },
                { month: "2026-07", count: 7 },
              ],
              topRepos: [{ fullName: "owner/popular", language: "TypeScript", stargazersCount: 100000 }],
            },
          }),
        ),
      ),
    ),
  );
});

afterEach(() => {
  while (roots.length > 0) roots.pop()?.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("DashboardView", () => {
  it("优先展示个人收藏洞察而不是重复的社区热度指标", async () => {
    const element = mount(<DashboardView />);
    await flushDashboard();

    expect(element.textContent).toContain("收藏洞察");
    expect(element.textContent).toContain("重点收藏率");
    expect(element.textContent).toContain("2.9%");
    expect(element.textContent).toContain("近 30 天新增");
    expect(element.textContent).toContain("待关注仓库");
    expect(element.textContent).toContain("每月新增 Stars");
    expect(element.textContent).not.toContain("最热门标星");
  });

  it("点击待关注仓库会进入对应详情", async () => {
    const onNavigateToRepo = vi.fn();
    const element = mount(<DashboardView onNavigateToRepo={onNavigateToRepo} />);
    await flushDashboard();

    const repoButton = Array.from(element.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("owner/old-repo"),
    );
    expect(repoButton).toBeTruthy();

    act(() => repoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onNavigateToRepo).toHaveBeenCalledWith("repo-1", "owner/old-repo");
  });

  it("让社区热门与左侧卡片等高，并在卡片内部滚动", async () => {
    const element = mount(<DashboardView />);
    await flushDashboard();

    const attentionCard = element.querySelector('[data-testid="dashboard-attention-card"]');
    const communityCard = element.querySelector('[data-testid="dashboard-community-card"]');
    const communityScroll = element.querySelector('[data-testid="dashboard-community-scroll"]');

    expect(attentionCard?.className).toContain("h-[500px]");
    expect(communityCard?.className).toContain("h-[500px]");
    expect(communityScroll?.className).toContain("overflow-y-auto");
  });
});
