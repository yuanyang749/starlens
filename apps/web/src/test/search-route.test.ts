import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchReposInput } from "@starlens/core";

const { searchReposMock, getApiUserMock } = vi.hoisted(() => ({
  searchReposMock: vi.fn(),
  getApiUserMock: vi.fn(),
}));

vi.mock("@/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@/server/repos/repository", () => ({
  searchRepos: searchReposMock,
}));

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("search API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "user-1" });
    searchReposMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasMore: false,
    });
  });

  it("normalizes combined filters before searching", async () => {
    const { GET } = await import("@/app/api/search/route");
    const request = new Request(
      "https://starlens.test/api/search?q=%20React%20&language=%20TypeScript%20&owner=%20Vercel%20&tag=%20Frontend%20&favorite=TRUE&sort=STARS&page=2&pageSize=50",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(searchReposMock).toHaveBeenCalledWith("user-1", {
      q: "React",
      page: 2,
      pageSize: 50,
      language: "TypeScript",
      owner: "Vercel",
      tag: "frontend",
      favorite: true,
      sort: "stars",
    } satisfies SearchReposInput);
    await expect(json(response)).resolves.toMatchObject({ ok: true });
  });

  it("clamps pagination and falls back to updated sort for invalid input", async () => {
    const { GET } = await import("@/app/api/search/route");
    const request = new Request(
      "https://starlens.test/api/search?q=%20%20&language=&owner=&tag=&favorite=maybe&sort=random&page=-7&pageSize=1000",
    );

    await GET(request);

    expect(searchReposMock).toHaveBeenCalledWith("user-1", {
      q: undefined,
      page: 1,
      pageSize: 100,
      language: undefined,
      owner: undefined,
      tag: undefined,
      favorite: undefined,
      sort: "updated",
    } satisfies SearchReposInput);
  });

  it("keeps page and sort explicit for relevance searches across pages", async () => {
    const { GET } = await import("@/app/api/search/route");
    const request = new Request(
      "https://starlens.test/api/search?q=virtualized&sort=relevance&page=3&pageSize=20&language=TypeScript&tag=ui",
    );

    await GET(request);

    expect(searchReposMock).toHaveBeenCalledWith("user-1", {
      q: "virtualized",
      page: 3,
      pageSize: 20,
      language: "TypeScript",
      owner: undefined,
      tag: "ui",
      favorite: undefined,
      sort: "relevance",
    } satisfies SearchReposInput);
  });
});
