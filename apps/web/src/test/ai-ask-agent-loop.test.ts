/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchReposMock, getRepoDetailMock, getRepoStatsMock, syncGitHubStarsMock } = vi.hoisted(() => ({
  searchReposMock: vi.fn(),
  getRepoDetailMock: vi.fn(),
  getRepoStatsMock: vi.fn(),
  syncGitHubStarsMock: vi.fn(),
}));

vi.mock("@starlens/server/server/repos/repository", () => ({
  searchRepos: searchReposMock,
  getRepoDetail: getRepoDetailMock,
  getRepoStats: getRepoStatsMock,
}));

vi.mock("@starlens/server/server/github/sync", () => ({
  syncGitHubStars: syncGitHubStarsMock,
}));

// 中文注释：guardedFetch 会做真实 DNS 校验，测试环境里透传给（已 stub 的）全局 fetch。
vi.mock("@starlens/server/server/security/url-guard", () => ({
  guardedFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

const chatConfig = {
  id: "ai-1",
  providerType: "openai_compatible" as const,
  model: "test-model",
  baseUrl: "https://api.example.com/v1",
  apiKey: "test-key",
  extraHeaders: {},
};

function repo(id: string, fullName: string) {
  return {
    id,
    fullName,
    description: `${fullName} description`,
    repoSummary: `${fullName} summary`,
    aiSummary: undefined,
    topics: [],
    tags: [],
    language: "TypeScript",
    stargazersCount: 100,
    isFavorite: false,
    note: "",
    starredAtGithub: "2026-07-01T00:00:00.000Z",
    pushedAtGithub: "2026-07-12T00:00:00.000Z",
  };
}

function toolCallResponse(toolCalls: Array<{ id: string; name: string; args: unknown }>) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: null,
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            })),
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function plainTextResponse(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content, tool_calls: undefined } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("agent loop (runAgentLoop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("searches then submits an answer grounded in the search results", async () => {
    searchReposMock.mockResolvedValue({
      items: [repo("repo-1", "owner/agent-repo")],
      page: 1, pageSize: 10, total: 1, hasMore: false, allStarsTotal: 1,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-1", name: "search_repos", args: { q: "agent" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-2", name: "submit_answer", args: { answer: "找到了 owner/agent-repo。", repoIds: ["repo-1"] } }]));
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    const result = await runAgentLoop("agent repo", "user-1", chatConfig);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result?.answer).toBe("找到了 owner/agent-repo。");
    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]).toMatchObject({ id: "repo-1", fullName: "owner/agent-repo", source: "agent_tool_result" });
  });

  it("prompts the user to refresh after a successful chat-triggered sync", async () => {
    syncGitHubStarsMock.mockResolvedValue({
      status: "success",
      pageCount: 1,
      counts: { fetched: 165, insertedOrUpdated: 165, unstarred: 10 },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-1", name: "sync_stars", args: {} }]))
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-2", name: "submit_answer", args: { answer: "同步已完成。", repoIds: [] } }]));
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    const result = await runAgentLoop("同步一下仓库", "user-1", chatConfig);

    expect(syncGitHubStarsMock).toHaveBeenCalledWith("user-1");
    expect(result?.answer).toContain("请手动刷新页面");
  });

  it("uses the compact prompt, restricted tools, and lower output cap for a preset", async () => {
    searchReposMock.mockResolvedValue({
      items: [repo("repo-1", "owner/recent-repo")],
      page: 1, pageSize: 10, total: 1, hasMore: false, allStarsTotal: 1,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-1", name: "search_repos", args: { sort: "updated", pageSize: 10 } }]))
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-2", name: "submit_answer", args: { answer: "最近值得重看。", repoIds: ["repo-1"] } }]));
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    await runAgentLoop("最近更新", "user-1", chatConfig, {
      systemPrompt: "预设专用提示：只调用 search_repos，然后调用 submit_answer。",
      allowedToolNames: ["search_repos", "submit_answer"],
      maxIterations: 3,
      maxTokens: 600,
    });

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.max_tokens).toBe(600);
    expect(firstRequest.messages[0]).toEqual({
      role: "system",
      content: "预设专用提示：只调用 search_repos，然后调用 submit_answer。",
    });
    expect(firstRequest.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual([
      "search_repos",
      "submit_answer",
    ]);
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const toolResult = JSON.parse(secondRequest.messages.find((message: { role: string }) => message.role === "tool").content);
    expect(toolResult.items[0]).toMatchObject({
      fullName: "owner/recent-repo",
      pushedAt: "2026-07-12T00:00:00.000Z",
    });
  });

  it("ignores repoIds that never appeared in a tool result (no fabricated candidates)", async () => {
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0, hasMore: false, allStarsTotal: 0 });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      toolCallResponse([{ id: "call-1", name: "submit_answer", args: { answer: "没有找到匹配的仓库。", repoIds: ["made-up-id"] } }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    const result = await runAgentLoop("something", "user-1", chatConfig);

    expect(result?.candidates).toHaveLength(0);
  });

  it("gives up after two consecutive turns with no tool call (provider likely doesn't support tool-calling)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(plainTextResponse("我不太确定"));
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    const result = await runAgentLoop("test", "user-1", chatConfig);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeNull();
  });

  it("stops at MAX_AGENT_ITERATIONS and returns null when submit_answer is never called (no guessed answer)", async () => {
    searchReposMock.mockResolvedValue({ items: [repo("repo-1", "owner/x")], page: 1, pageSize: 10, total: 1, hasMore: false, allStarsTotal: 1 });
    const fetchMock = vi.fn().mockImplementation(async () =>
      toolCallResponse([{ id: "call-loop", name: "search_repos", args: { q: "x" } }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    const { MAX_AGENT_ITERATIONS } = await import("@starlens/server/server/ai/ask/types");
    const result = await runAgentLoop("test", "user-1", chatConfig);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_AGENT_ITERATIONS);
    expect(result).toBeNull();
  });

  it("returns null immediately when the provider request fails outright (no retry storm)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");
    const result = await runAgentLoop("test", "user-1", chatConfig);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});
