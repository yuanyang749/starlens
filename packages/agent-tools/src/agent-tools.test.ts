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
  it("exposes search, detail, curation, sync, and AI tools", () => {
    expect(agentTools.map((tool) => tool.name)).toEqual([
      "search_stars",
      "show_star",
      "sync_stars",
      "favorite_star",
      "unfavorite_star",
      "set_star_note",
      "add_star_tag",
      "remove_star_tag",
      "ask_stars",
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
});
