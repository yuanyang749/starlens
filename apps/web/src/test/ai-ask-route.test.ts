/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSystemDefaultAiRuntimeConfig } from "@starlens/server/server/ai/runtime-resolver";

const { getApiUserMock, resolveAiRuntimeConfigMock, searchReposMock, searchReposRankedMock, getRepoDetailMock, getRepoStatsMock } = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  resolveAiRuntimeConfigMock: vi.fn(),
  searchReposMock: vi.fn(),
  searchReposRankedMock: vi.fn(),
  getRepoDetailMock: vi.fn(),
  getRepoStatsMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@starlens/server/server/repos/repository", () => ({
  searchRepos: searchReposMock,
  searchReposRanked: searchReposRankedMock,
  getRepoDetail: getRepoDetailMock,
  getRepoStats: getRepoStatsMock,
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
    getRepoDetailMock.mockResolvedValue(null);
    getRepoStatsMock.mockResolvedValue({ total: 0, byLanguage: [], totalFavorites: 0, mostStarredRepo: null });
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

  // ─── 新意图类型测试（AI 识别意图 + 直接 DB 路径）──────────────────────────────

  const mockAiConfig = {
    source: "user_default" as const,
    config: {
      id: "ai-cfg",
      providerType: "openai_compatible" as const,
      baseUrl: "https://ai.test/v1",
      apiKey: "key",
      extraHeaders: {},
      model: "model",
    },
  };

  it("count intent: AI识别统计数量并返回 total", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"kind":"count","language":"python"}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 1, total: 42, hasMore: false });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "我有多少个Python项目" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("42");
    vi.unstubAllGlobals();
  });

  it("existence intent: 未找到时返回友好提示", async () => {
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, hasMore: false });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "我有没有收藏 nonexistent/repo" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("未找到");
  });

  it("existence intent: 找到时列出仓库", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"kind":"existence","query":"react"}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    searchReposMock.mockResolvedValue({
      items: [repo("r1", "facebook/react"), repo("r2", "vercel/next.js")],
      page: 1, pageSize: 5, total: 2, hasMore: false,
    });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "我有没有收藏 react 相关的仓库" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string; candidates: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("2");
    expect(body.data.candidates.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("stats intent: AI识别并返回统计信息", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"kind":"stats"}' } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "你共有 100 个仓库，TypeScript 占比最高。" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    getRepoStatsMock.mockResolvedValue({
      total: 100,
      byLanguage: [{ language: "TypeScript", count: 40 }, { language: "Python", count: 30 }],
      totalFavorites: 15,
      mostStarredRepo: { fullName: "sindresorhus/awesome", stargazersCount: 250000 },
    });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "我的收藏按语言分布如何" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("100");
    vi.unstubAllGlobals();
  });

  it("comparison intent: 两仓库都未找到时返回提示", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"kind":"comparison","repoA":"langchain","repoB":"llamaindex"}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 3, total: 0, hasMore: false });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "langchain 和 llamaindex 哪个更好用" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("langchain");
    vi.unstubAllGlobals();
  });

  it("comparison intent: 找到两仓库时调用 AI 对比", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"kind":"comparison","repoA":"langchain","repoB":"llamaindex"}' } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "langchain 更适合生产环境，llamaindex 更适合快速原型。" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    getRepoDetailMock.mockResolvedValue(repo("r1", "langchain-ai/langchain"));
    searchReposMock.mockImplementation(async (_userId: string, opts: { q?: string }) => {
      const name = opts?.q?.toLowerCase() ?? "";
      if (name.includes("langchain")) return { items: [repo("r1", "langchain-ai/langchain")], page: 1, pageSize: 3, total: 1, hasMore: false };
      if (name.includes("llamaindex")) return { items: [repo("r2", "run-llama/llama_index")], page: 1, pageSize: 3, total: 1, hasMore: false };
      return { items: [], page: 1, pageSize: 3, total: 0, hasMore: false };
    });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "langchain 和 llamaindex 哪个更好用" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string; candidates: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("langchain");
    vi.unstubAllGlobals();
  });

  it("recommendation intent: 返回方向性建议", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"kind":"recommendation","context":"适合初学者的Python项目"}' } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "建议从 requests 和 Flask 入手，适合 Python 初学者。" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    getRepoStatsMock.mockResolvedValue({ total: 50, byLanguage: [{ language: "Python", count: 30 }], totalFavorites: 5, mostStarredRepo: null });
    searchReposMock.mockResolvedValue({ items: [], page: 1, pageSize: 15, total: 0, hasMore: false });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "推荐适合初学者的Python项目" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("Python");
    vi.unstubAllGlobals();
  });

  it("single_repo intent: 精确分析指定仓库", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"repoIdentifier":"facebook/react"}' } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "React 是 Meta 开源的 UI 框架，适合构建复杂前端应用。" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    const reactRepo = { ...repo("r1", "facebook/react"), readmeExcerpt: "A declarative, component-based library for building UIs." };
    searchReposMock.mockResolvedValue({ items: [reactRepo], page: 1, pageSize: 5, total: 1, hasMore: false });
    getRepoDetailMock.mockResolvedValue(reactRepo);
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "介绍一下 facebook/react" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string; candidates: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toContain("React");
    expect(body.data.candidates).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("structured intent: 按 star 数排序并返回候选列表", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"sort":"stars","topN":5}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    resolveAiRuntimeConfigMock.mockResolvedValue(mockAiConfig);
    const items = ["sindresorhus/awesome", "vuejs/vue", "facebook/react"].map((n, i) => repo(`r${i}`, n));
    searchReposMock.mockResolvedValue({ items, page: 1, pageSize: 5, total: 3, hasMore: false });
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "star最多的前5个仓库" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string; candidates: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data.candidates.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("无 AI 配置时降级为 semantic 路径，返回有效响应", async () => {
    // resolveAiRuntimeConfigMock 默认返回 { config: null, source: "none" }
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "我有多少个Python项目" }),
      }),
    );
    const body = await json(response) as { ok: boolean; data: { answer: string } };
    expect(body.ok).toBe(true);
    expect(typeof body.data.answer).toBe("string");
    // 无 AI 时走 semantic，answer 为确定性回退文案而非空值
    expect(body.data.answer.length).toBeGreaterThan(0);
  });

  it("question 超过长度限制时返回 400", async () => {
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "a".repeat(1001) }),
      }),
    );
    const body = await json(response) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("question_too_long");
  });

  it("unknown command exits with code 1 (CLI guard)", async () => {
    // 验证 POST 处理无效问题时返回 fail
    const { POST } = await import("@/app/api/ai/ask/route");
    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "" }),
      }),
    );
    const body = await json(response) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
