/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getApiUserMock, resolveAiRuntimeConfigMock, answerWithAgentMock, checkRateLimitMock } = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  resolveAiRuntimeConfigMock: vi.fn(),
  answerWithAgentMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@starlens/server/server/ai/configs", () => ({
  resolveAiRuntimeConfig: resolveAiRuntimeConfigMock,
}));

vi.mock("@starlens/server/server/ai/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

// 中文注释：路由层测试只关心"鉴权/参数校验/限流/Agent 结果怎么被组装成响应"，
// Agent 循环本身（多轮工具调用、SQL 校验等）在 ai-ask-agent-loop.test.ts 里单独覆盖。
vi.mock("@starlens/server/server/ai/ask/agent/index", () => ({
  answerWithAgent: answerWithAgentMock,
}));

async function json(response: Response) {
  return response.json() as Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }>;
}

const chatConfig = {
  id: "ai-1",
  providerType: "openai_compatible" as const,
  model: "test-model",
  baseUrl: "https://api.example.com/v1",
  apiKey: "test-key",
  extraHeaders: {},
};

describe("AI ask API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "user-1" });
    resolveAiRuntimeConfigMock.mockResolvedValue({ config: chatConfig, source: "user_default" });
    checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it("rejects unauthenticated requests", async () => {
    getApiUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", { method: "POST", body: JSON.stringify({ question: "test" }) }),
    );

    expect(response.status).toBe(401);
    expect(answerWithAgentMock).not.toHaveBeenCalled();
  });

  it("rejects empty questions before resolving any config", async () => {
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", { method: "POST", body: JSON.stringify({ question: "   " }) }),
    );

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("invalid_question");
    expect(resolveAiRuntimeConfigMock).not.toHaveBeenCalled();
  });

  it("rejects questions over the max length", async () => {
    const { POST } = await import("@/app/api/ai/ask/route");
    const { MAX_QUESTION_LENGTH } = await import("@starlens/server/server/ai/ask/types");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "a".repeat(MAX_QUESTION_LENGTH + 1) }),
      }),
    );

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("question_too_long");
  });

  it("returns a clear error when no AI provider is configured (no fallback to guessing)", async () => {
    resolveAiRuntimeConfigMock.mockResolvedValue({ config: null, source: "none" });
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", { method: "POST", body: JSON.stringify({ question: "test" }) }),
    );

    const body = await json(response);
    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("no_ai_provider");
    expect(answerWithAgentMock).not.toHaveBeenCalled();
  });

  it("returns the agent's answer and candidates on success", async () => {
    answerWithAgentMock.mockResolvedValue({
      answer: "已检索到 owner/repo。",
      candidates: [
        { id: "repo-1", fullName: "owner/repo", reason: "matched", source: "agent_tool_result", score: 1000 },
      ],
    });
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", { method: "POST", body: JSON.stringify({ question: "最近收藏的仓库" }) }),
    );

    const body = await json(response);
    expect(answerWithAgentMock).toHaveBeenCalledWith("最近收藏的仓库", "user-1", chatConfig);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      answer: "已检索到 owner/repo。",
      candidates: [{ id: "repo-1", fullName: "owner/repo" }],
      providerConfigId: "ai-1",
      providerConfigSource: "user_default",
    });
  });

  it("returns a clear failure (not a guessed answer) when the agent can't find a confident result", async () => {
    answerWithAgentMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", { method: "POST", body: JSON.stringify({ question: "不存在的东西" }) }),
    );

    const body = await json(response);
    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("ask_failed");
  });

  it("returns 429 and never calls the agent when the rate limit is exceeded", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterSeconds: 12 });
    const { POST } = await import("@/app/api/ai/ask/route");

    const response = await POST(
      new Request("https://starlens.test/api/ai/ask", { method: "POST", body: JSON.stringify({ question: "test" }) }),
    );

    const body = await json(response);
    expect(response.status).toBe(429);
    expect(body.error?.code).toBe("rate_limit_exceeded");
    expect(answerWithAgentMock).not.toHaveBeenCalled();
  });
});
