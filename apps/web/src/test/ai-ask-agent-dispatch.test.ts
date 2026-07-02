/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchReposMock, getRepoDetailMock, getRepoStatsMock, runReadonlyQueryMock } = vi.hoisted(() => ({
  searchReposMock: vi.fn(),
  getRepoDetailMock: vi.fn(),
  getRepoStatsMock: vi.fn(),
  runReadonlyQueryMock: vi.fn(),
}));

vi.mock("@starlens/server/server/repos/repository", () => ({
  searchRepos: searchReposMock,
  getRepoDetail: getRepoDetailMock,
  getRepoStats: getRepoStatsMock,
}));

vi.mock("@starlens/server/server/ai/ask/agent/sql-executor", () => ({
  runReadonlyQuery: runReadonlyQueryMock,
}));

function repo(id: string, fullName: string) {
  return {
    id, fullName, description: "", repoSummary: "", aiSummary: undefined,
    topics: [], tags: [], language: "TypeScript", stargazersCount: 42,
    isFavorite: false, note: "", starredAtGithub: "2026-07-01T00:00:00.000Z",
  };
}

function call(id: string, name: string, args: unknown) {
  return { id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
}

describe("agent tool dispatch (executeToolCall)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("caches search_repos results by id and returns a compact payload", async () => {
    searchReposMock.mockResolvedValue({ items: [repo("repo-1", "owner/repo")], page: 1, pageSize: 10, total: 1, hasMore: false, allStarsTotal: 1 });
    const { executeToolCall } = await import("@starlens/server/server/ai/ask/agent/dispatch");
    const cache = new Map();

    const result = await executeToolCall(call("c1", "search_repos", { q: "test" }), "user-1", cache);

    expect(cache.get("repo-1")).toMatchObject({ id: "repo-1", fullName: "owner/repo" });
    const parsed = JSON.parse(result.content);
    expect(parsed.items[0]).toMatchObject({ id: "repo-1", fullName: "owner/repo" });
    expect(searchReposMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ q: "test" }));
  });

  it("clamps pageSize to a maximum of 20", async () => {
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false, allStarsTotal: 0 });
    const { executeToolCall } = await import("@starlens/server/server/ai/ask/agent/dispatch");

    await executeToolCall(call("c1", "search_repos", { pageSize: 999 }), "user-1", new Map());

    expect(searchReposMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ pageSize: 20 }));
  });

  it("returns an error payload (not a thrown exception) for malformed arguments JSON", async () => {
    const { executeToolCall } = await import("@starlens/server/server/ai/ask/agent/dispatch");
    const badCall = { id: "c1", type: "function" as const, function: { name: "search_repos", arguments: "{not json" } };

    const result = await executeToolCall(badCall, "user-1", new Map());

    expect(JSON.parse(result.content)).toHaveProperty("error");
  });

  it("returns an error payload for an unknown tool name", async () => {
    const { executeToolCall } = await import("@starlens/server/server/ai/ask/agent/dispatch");

    const result = await executeToolCall(call("c1", "delete_everything", {}), "user-1", new Map());

    expect(JSON.parse(result.content)).toEqual({ error: "unknown tool" });
  });

  it("get_repo_detail caches the result and returns an error when not found", async () => {
    getRepoDetailMock.mockResolvedValueOnce(repo("repo-2", "owner/found")).mockResolvedValueOnce(null);
    const { executeToolCall } = await import("@starlens/server/server/ai/ask/agent/dispatch");
    const cache = new Map();

    const found = await executeToolCall(call("c1", "get_repo_detail", { repoId: "repo-2" }), "user-1", cache);
    expect(cache.get("repo-2")).toBeTruthy();
    expect(JSON.parse(found.content)).toHaveProperty("context");

    const notFound = await executeToolCall(call("c2", "get_repo_detail", { repoId: "missing" }), "user-1", cache);
    expect(JSON.parse(notFound.content)).toEqual({ error: "repo not found" });
  });

  it("run_readonly_query surfaces the validator's error instead of throwing", async () => {
    runReadonlyQueryMock.mockRejectedValue(new Error("Only SELECT (or WITH ... SELECT) statements are allowed."));
    const { executeToolCall } = await import("@starlens/server/server/ai/ask/agent/dispatch");

    const result = await executeToolCall(call("c1", "run_readonly_query", { sql: "DELETE FROM starred_repos" }), "user-1", new Map());

    expect(JSON.parse(result.content).error).toMatch(/SELECT/);
  });
});
