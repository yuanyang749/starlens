import { beforeEach, describe, expect, it, vi } from "vitest";

const { getApiUserMock, getDefaultAiRuntimeConfigMock, searchReposMock } = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  getDefaultAiRuntimeConfigMock: vi.fn(),
  searchReposMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@starlens/server/server/repos/repository", () => ({
  searchRepos: searchReposMock,
}));

vi.mock("@starlens/server/server/ai/configs", () => ({
  getDefaultAiRuntimeConfig: getDefaultAiRuntimeConfigMock,
}));

function repo(id: string, fullName: string) {
  return {
    id,
    fullName,
    description: `${fullName} description`,
    repoSummary: `${fullName} summary`,
    topics: [],
    tags: [],
    language: "TypeScript",
    stargazersCount: 100,
    starredAtGithub: "2026-05-12T00:00:00.000Z",
  };
}

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("AI ask API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "user-1" });
    getDefaultAiRuntimeConfigMock.mockResolvedValue(null);
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL_KEY;
  });

  it("returns explained candidates and keeps direct question hits ahead of heuristic hits", async () => {
    const { POST } = await import("@/app/api/ai/ask/route");

    searchReposMock.mockImplementation(async (_userId: string, input: { q?: string }) => {
      if (input.q === "agent repo") {
        return {
          items: [repo("repo-direct", "owner/direct-hit")],
          page: 1,
          pageSize: 8,
          total: 1,
          hasMore: false,
        };
      }

      if (input.q === "ai agent") {
        return {
          items: [repo("repo-heuristic", "owner/heuristic-hit")],
          page: 1,
          pageSize: 8,
          total: 1,
          hasMore: false,
        };
      }

      return {
        items: [],
        page: 1,
        pageSize: 8,
        total: 0,
        hasMore: false,
      };
    });

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "agent repo" }),
      }),
    );

    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: {
        answer: "已检索到 2 个匹配仓库，最相关的是 owner/direct-hit。",
        candidates: [
          {
            id: "repo-direct",
            fullName: "owner/direct-hit",
            source: "question_search",
            reason: 'Matched your question directly: "agent repo".',
          },
          {
            id: "repo-heuristic",
            fullName: "owner/heuristic-hit",
            source: "heuristic_search",
            reason: 'Matched heuristic term: "ai agent".',
          },
        ],
        providerConfigId: null,
      },
    });
  });

  it("rejects empty questions before running recall", async () => {
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "   " }),
      }),
    );

    expect(searchReposMock).not.toHaveBeenCalled();
    await expect(json(response)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_question" },
    });
  });

  it("returns the newapi provider id when OpenAI-compatible env vars are enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_BASE_URL = "https://newapi.520ai.xin/v1";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL_KEY = "gpt-5.4-mini";

    const { POST } = await import("@/app/api/ai/ask/route");

    searchReposMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 0,
      hasMore: false,
    });

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "agent repo" }),
      }),
    );

    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: {
        providerConfigId: "env:newapi-openai-compatible",
      },
    });

    vi.unstubAllGlobals();
  });

  it("uses the user's default OpenAI-compatible provider before env fallback", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "默认配置回答" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    getDefaultAiRuntimeConfigMock.mockResolvedValue({
      id: "ai-default",
      providerType: "openai_compatible",
      baseUrl: "https://provider.test/v1",
      apiKey: "user-key",
      extraHeaders: { "x-provider": "custom" },
      model: "gpt-user",
    });

    const { POST } = await import("@/app/api/ai/ask/route");

    searchReposMock.mockResolvedValue({
      items: [repo("repo-1", "owner/repo")],
      page: 1,
      pageSize: 8,
      total: 1,
      hasMore: false,
    });

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "agent repo" }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.test/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer user-key",
          "x-provider": "custom",
        }),
      }),
    );
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: {
        answer: "默认配置回答",
        providerConfigId: "ai-default",
      },
    });

    vi.unstubAllGlobals();
  });
});
