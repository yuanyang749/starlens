// related-data 路由层集成测试 —— 直连真实 DB
// 中文注释：本文件验证 /api/repos/related-data 路由的端到端行为：
//   1. 已 star 目标仓库：返回三维度召回的候选 + recallReasons
//   2. 不存在的目标仓库：返回 empty: true + target: null
//   3. 参数校验：缺失 repo 返回 400
// 路由层直接调用（不通过 HTTP），mock 掉 getApiUser 绕过鉴权，DB 查询走真实数据库（只读）。
/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 中文注释：测试 userId（182 个 starred repos）和样本仓库 id。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const REAL_ESRGAN_ID = "c636f221-92cc-420c-adec-f42c3a0da6ff";
const REAL_ESRGAN_FULL_NAME = "xinntao/Real-ESRGAN";

// 中文注释：环境变量缺失时跳过整个文件——CI 环境通常没有本地 DB。
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

// mock getApiUser 绕过鉴权——返回测试 userId，让路由用真实 DB 查数据。
const { getApiUserMock } = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

const DB_TIMEOUT = 30_000;

async function postRoute(body: unknown) {
  const { POST } = await import("./related-data/route");
  const response = await POST(
    new Request("https://starlens.test/api/repos/related-data", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  return response;
}

// 中文注释：ok() 包裹后响应结构是 { ok, data: { data: { target, items }, meta, suggestedNextActions, reasoningHints } }。
type ResponseBody = {
  ok: boolean;
  data?: {
    data?: {
      target: {
        id: string;
        fullName: string;
        language: string;
        topics: string[];
        description: string;
      } | null;
      items: Array<{
        id: string;
        fullName: string;
        description: string;
        htmlUrl: string;
        stargazersCount: number;
        language: string;
        topics: string[];
        recallReasons: string[];
      }>;
    };
    meta?: { empty: boolean; hint?: string };
    suggestedNextActions?: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
    reasoningHints?: string;
  };
  error?: { code: string; message: string };
};

async function json(response: Response) {
  return (await response.json()) as ResponseBody;
}

describeDb("POST /api/repos/related-data (route integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: TEST_USER_ID, email: null });
  });

  it("returns related repos recalled by owner / language / topics for a known target", async () => {
    // 用 Real-ESRGAN 的 id 查找相关仓库
    const response = await postRoute({ repo: REAL_ESRGAN_ID, limit: 5 });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();

    const data = body.data?.data;
    expect(data).toBeDefined();
    expect(data?.target).not.toBeNull();
    expect(data?.target?.id).toBe(REAL_ESRGAN_ID);
    expect(data?.target?.fullName).toBe(REAL_ESRGAN_FULL_NAME);

    expect(Array.isArray(data?.items)).toBe(true);

    // 中文注释：测试用户有 182 个 starred repos，Python 仓库很多——
    // 应至少能从 language 维度召回候选，meta.empty 通常为 false。
    // 但 AI 可能判定都不相关（合法），所以只对有结果时验证结构。
    for (const item of data?.items ?? []) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(typeof item.htmlUrl).toBe("string");
      expect(typeof item.stargazersCount).toBe("number");
      expect(Array.isArray(item.recallReasons)).toBe(true);
      // recallReasons 至少包含一个维度（同 owner / 同 language / 同 topic）
      expect(item.recallReasons.length).toBeGreaterThan(0);
      // 目标仓库本身不应出现在结果中
      expect(item.id).not.toBe(REAL_ESRGAN_ID);
    }

    // meta + suggestedNextActions + reasoningHints 同在 data 同级
    expect(body.data?.meta).toBeDefined();
    expect(typeof body.data?.meta?.empty).toBe("boolean");
    expect(typeof body.data?.reasoningHints).toBe("string");
    expect(Array.isArray(body.data?.suggestedNextActions)).toBe(true);
  }, DB_TIMEOUT);

  it("returns empty: true + target: null for non-existent target repo", async () => {
    // 中文注释：不存在的目标仓库 → resolveTargetRepo 返回 null → 路由返回 empty: true + target: null
    const response = await postRoute({ repo: "nonexistent-user/no-such-repo-xyz123" });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data?.data?.target).toBeNull();
    expect(body.data?.data?.items).toEqual([]);
    expect(body.data?.meta?.empty).toBe(true);
    expect(typeof body.data?.meta?.hint).toBe("string");
  }, DB_TIMEOUT);

  it("returns 400 invalid_repo when repo parameter is missing", async () => {
    // 缺失 repo 参数：返回 400
    const response = await postRoute({});
    expect(response.status).toBe(400);

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("invalid_repo");
  });

  it("returns 401 unauthorized when auth fails", async () => {
    // 未鉴权：返回 401
    getApiUserMock.mockResolvedValue(null);
    const response = await postRoute({ repo: REAL_ESRGAN_FULL_NAME });
    expect(response.status).toBe(401);

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("unauthorized");
  });
});
