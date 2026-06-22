/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSystemDefaultAiRuntimeConfig } from "@starlens/server/server/ai/runtime-resolver";

const { getApiUserMock, resolveAiRuntimeConfigMock, searchReposMock, searchReposRankedMock } = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  resolveAiRuntimeConfigMock: vi.fn(),
  searchReposMock: vi.fn(),
  searchReposRankedMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@starlens/server/server/repos/repository", () => ({
  searchRepos: searchReposMock,
  searchReposRanked: searchReposRankedMock,
}));

vi.mock("@starlens/server/server/ai/configs", () => ({
  resolveAiRuntimeConfig: resolveAiRuntimeConfigMock,
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
    resolveAiRuntimeConfigMock.mockResolvedValue({ config: null, source: "none" });
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0, hasMore: false });
    searchReposRankedMock.mockResolvedValue([]);
    delete process.env.SYSTEM_AI_ENABLED;
    delete process.env.SYSTEM_AI_PROVIDER_TYPE;
    delete process.env.SYSTEM_AI_BASE_URL;
    delete process.env.SYSTEM_AI_API_KEY;
    delete process.env.SYSTEM_AI_MODEL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL_KEY;
  });

  it("returns explained candidates and keeps direct question hits ahead of heuristic hits", async () => {
    const { POST } = await import("@/app/api/ai/ask/route");

    searchReposRankedMock.mockImplementation(async (_userId: string, query: string) => {
      if (query === "agent repo") {
        return [
          {
            ...repo("repo-direct", "owner/direct-hit"),
            tsRank: 0.8, // Need positive tsRank for recall threshold
          },
        ];
      }

      if (query === "ai agent") {
        return [
          {
            ...repo("repo-heuristic", "owner/heuristic-hit"),
            tsRank: 0.6,
          },
        ];
      }

      return [];
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
        providerConfigSource: "none",
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

  it("parses system default config from the new SYSTEM_AI_* env names", () => {
    const config = resolveSystemDefaultAiRuntimeConfig({
      SYSTEM_AI_PROVIDER_TYPE: "openai_compatible",
      SYSTEM_AI_BASE_URL: "https://newapi.520ai.xin/v1",
      SYSTEM_AI_API_KEY: "test-key",
      SYSTEM_AI_MODEL: "gemini-3-flash",
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      id: "system:default",
      providerType: "openai_compatible",
      baseUrl: "https://newapi.520ai.xin/v1",
      apiKey: "test-key",
      model: "gemini-3-flash",
    });
  });

  it("keeps compatibility with legacy OPENAI_* env names for system fallback", () => {
    const config = resolveSystemDefaultAiRuntimeConfig({
      OPENAI_BASE_URL: "https://newapi.520ai.xin/v1",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL_KEY: "gemini-3-flash",
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      id: "system:default",
      providerType: "openai_compatible",
      baseUrl: "https://newapi.520ai.xin/v1",
      apiKey: "test-key",
      model: "gemini-3-flash",
    });
  });

  it("returns the system default provider id when runtime fallback is enabled", async () => {
    // mockImplementation 每次返回新 Response 实例，避免 body 被意图检测消费后 askProvider 无法读取
    const fetchMock = vi.fn().mockImplementation(async () =>
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
    resolveAiRuntimeConfigMock.mockResolvedValue({
      source: "system_default",
      config: {
        id: "system:default",
        providerType: "openai_compatible",
        baseUrl: "https://newapi.520ai.xin/v1",
        apiKey: "test-key",
        extraHeaders: {},
        model: "gemini-3-flash",
      },
    });

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
        providerConfigId: "system:default",
        providerConfigSource: "system_default",
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
    resolveAiRuntimeConfigMock.mockResolvedValue({
      source: "user_default",
      config: {
        id: "ai-default",
        providerType: "openai_compatible",
        baseUrl: "https://provider.test/v1",
        apiKey: "user-key",
        extraHeaders: { "x-provider": "custom" },
        model: "gpt-user",
      },
    });

    const { POST } = await import("@/app/api/ai/ask/route");

    searchReposMock.mockResolvedValue({
      items: [repo("repo-1", "owner/repo")],
      page: 1,
      pageSize: 8,
      total: 1,
      hasMore: false,
    });
    searchReposRankedMock.mockResolvedValue([
      {
        ...repo("repo-1", "owner/repo"),
        tsRank: 0.8,
      },
    ]);

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
        providerConfigSource: "user_default",
      },
    });

    vi.unstubAllGlobals();
  });
});
