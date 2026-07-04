import { describe, expect, it, vi } from "vitest";
import { agentTools, callAgentTool } from "./index";

function apiResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, data }),
  } as Response;
}

function apiFailure(status: number, message: string): Response {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ ok: false, error: { code: "error", message } }),
  } as Response;
}

describe("agent tools", () => {
  it("exposes search, detail, curation, sync, AI, and proactive tools", () => {
    expect(agentTools.map((tool) => tool.name)).toEqual([
      "search_stars",
      "show_star",
      "sync_stars",
      "favorite_star",
      "unfavorite_star",
      "star_repo",
      "unstar_repo",
      "set_star_note",
      "add_star_tag",
      "remove_star_tag",
      "ask_stars",
      // 5 个主动型工具（spec 第 6.1 节）
      "analyze_repo",
      "recommend_for_task",
      "find_related",
      "suggest_organization",
      "get_sync_summary",
    ]);
  });

  it("search_stars calls the search API with bearer auth", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ items: [{ fullName: "owner/repo" }], total: 1 }));

    const result = await callAgentTool(
      "search_stars",
      { query: "agent tools", pageSize: 5, favorite: true },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/search?q=agent+tools&pageSize=5&favorite=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer stl_test" }),
      }),
    );
    expect(result.content[0]?.text).toContain("owner/repo");
  });

  it("set_star_note patches repo curation", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ fullName: "owner/repo", note: "review later" }));

    const result = await callAgentTool(
      "set_star_note",
      { repo: "repo-1", note: "review later" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/repo-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ note: "review later" }),
      }),
    );
    expect(result.content[0]?.text).toContain("review later");
  });

  it("set_star_note accepts an empty note to clear repo curation", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ fullName: "owner/repo", note: "" }));

    await callAgentTool(
      "set_star_note",
      { repo: "repo-1", note: "" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/repo-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ note: "" }),
      }),
    );
  });

  it("add_star_tag posts a normalized tag request", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ tags: ["mobile"] }));

    await callAgentTool(
      "add_star_tag",
      { repo: "repo-1", tag: "mobile" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/repo-1/tags",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tag: "mobile" }),
      }),
    );
  });

  it("star_repo posts the repo to the real GitHub star API", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ fullName: "owner/repo", isStarred: true }));

    const result = await callAgentTool(
      "star_repo",
      { repo: "owner/repo" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/star",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repo: "owner/repo" }),
      }),
    );
    expect(result.content[0]?.text).toContain("owner/repo");
  });

  it("unstar_repo posts the repo to the real GitHub unstar API", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ fullName: "owner/repo", isStarred: false }));

    await callAgentTool(
      "unstar_repo",
      { repo: "repo-1" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/unstar",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repo: "repo-1" }),
      }),
    );
  });

  it("falls back from owner/repo to search when direct repo lookup misses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiFailure(404, "Repository was not found."))
      .mockResolvedValueOnce(apiResponse({ items: [{ id: "repo-1", fullName: "owner/repo" }] }))
      .mockResolvedValueOnce(apiResponse({ fullName: "owner/repo", isFavorite: true }));

    await callAgentTool(
      "favorite_star",
      { repo: "owner/repo" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/api/search?"), expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://starlens.test/api/repos/repo-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  // 5 个主动型工具的薄路由调用测试（spec 第 6.1 节）。
  // 中文注释：analyze_repo 走数据端点（/api/repos/analyze-data），不传 applySuggestions（已 deprecated）。
  it("analyze_repo posts to the analyze-data endpoint with only repo in body", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ repo: { fullName: "owner/repo" }, isStarred: true }));

    await callAgentTool(
      "analyze_repo",
      { repo: "owner/repo" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/analyze-data",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repo: "owner/repo" }),
      }),
    );
  });

  it("analyze_repo ignores applySuggestions arg (deprecated, not forwarded to data endpoint)", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ repo: { fullName: "owner/repo" }, isStarred: true }));

    await callAgentTool(
      "analyze_repo",
      { repo: "owner/repo", applySuggestions: true },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    // applySuggestions 不应出现在 body 中——数据端点不应用建议
    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/analyze-data",
      expect.objectContaining({
        body: JSON.stringify({ repo: "owner/repo" }),
      }),
    );
  });

  it("recommend_for_task posts the task description and clamps limit to 1-30", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ items: [], meta: { empty: true } }));

    await callAgentTool(
      "recommend_for_task",
      { taskDescription: "build a chat UI", limit: 50 },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/recommend-data",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ taskDescription: "build a chat UI", limit: 30 }),
      }),
    );
  });

  it("recommend_for_task omits limit when not provided as a number", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ items: [], meta: { empty: true } }));

    await callAgentTool(
      "recommend_for_task",
      { taskDescription: "build a chat UI" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/recommend-data",
      expect.objectContaining({
        body: JSON.stringify({ taskDescription: "build a chat UI" }),
      }),
    );
  });

  it("find_related posts the repo and limit to the related API", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ items: [{ fullName: "owner/other" }] }));

    await callAgentTool(
      "find_related",
      { repo: "owner/repo", limit: 5 },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/related-data",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repo: "owner/repo", limit: 5 }),
      }),
    );
  });

  it("suggest_organization calls the suggestions API with focus query", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ duplicates: [], stale: [], untagged: [] }));

    await callAgentTool(
      "suggest_organization",
      { focus: "stale" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/suggestions?focus=stale",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("suggest_organization drops invalid focus and lets the server default to all", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ duplicates: [], stale: [], untagged: [] }));

    await callAgentTool(
      "suggest_organization",
      { focus: "bogus" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/repos/suggestions",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("get_sync_summary forwards since as a query string when provided", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ added: [], removed: [], changed: [], totalCount: 0 }));

    await callAgentTool(
      "get_sync_summary",
      { since: "2026-07-01T00:00:00.000Z" },
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/sync/summary?since=2026-07-01T00%3A00%3A00.000Z",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("get_sync_summary omits since when not a non-empty string", async () => {
    const fetchMock = vi.fn(async () => apiResponse({ added: [], removed: [], changed: [], totalCount: 0 }));

    await callAgentTool(
      "get_sync_summary",
      {},
      { apiBaseUrl: "https://starlens.test", token: "stl_test", fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://starlens.test/api/sync/summary",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
