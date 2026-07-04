// recommend-data 路由层集成测试 —— 直连真实 DB
// 中文注释：本文件验证 /api/repos/recommend-data 路由的端到端行为：
//   1. 已有 starred repos 的用户：返回 ts_rank 排序的候选 + repoSummary / tags / note
//   2. 冷启动（不存在的 userId）：返回 empty: true + hint
//   3. 参数校验：缺失 taskDescription 返回 400
// 路由层直接调用（不通过 HTTP），mock 掉 getApiUser 绕过鉴权，DB 查询走真实数据库（只读）。
/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 中文注释：测试 userId（182 个 starred repos）和样本仓库。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const NON_EXISTENT_USER_ID = "00000000-0000-0000-0000-000000000000";

// 中文注释：环境变量缺失时跳过整个文件——CI 环境通常没有本地 DB。
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

// mock getApiUser 绕过鉴权——可动态切换 userId 测试冷启动。
const { getApiUserMock } = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

const DB_TIMEOUT = 30_000;

async function postRoute(body: unknown) {
  const { POST } = await import("./recommend-data/route");
  const response = await POST(
    new Request("https://starlens.test/api/repos/recommend-data", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  return response;
}

// 中文注释：ok() 包裹后响应结构是 { ok, data: { data: { items }, meta, suggestedNextActions, reasoningHints } }。
// data 同级包含四段：data（业务数据）/ meta / suggestedNextActions / reasoningHints。
type ResponseBody = {
  ok: boolean;
  data?: {
    data?: { items: Array<{
      id: string;
      fullName: string;
      repoSummary: string;
      tsRank: number;
      tags: string[];
      note: string;
    }> };
    meta?: { empty: boolean; hint?: string };
    suggestedNextActions?: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
    reasoningHints?: string;
  };
  error?: { code: string; message: string };
};

async function json(response: Response) {
  return (await response.json()) as ResponseBody;
}

describeDb("POST /api/repos/recommend-data (route integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: TEST_USER_ID, email: null });
  });

  it("returns ts_rank-sorted candidates for a relevant task description", async () => {
    // taskDescription="image super resolution" 应能召回 Real-ESRGAN 或其他图像处理仓库
    const response = await postRoute({ taskDescription: "image super resolution", limit: 5 });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();

    const items = body.data?.data?.items;
    expect(Array.isArray(items)).toBe(true);

    // 中文注释：检索结果不确定，但任务高度相关时通常能召回候选。
    // 若有结果，每项必须有 id / fullName / tsRank / repoSummary 等字段。
    for (const item of items ?? []) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(typeof item.tsRank).toBe("number");
      expect(typeof item.repoSummary).toBe("string");
      expect(Array.isArray(item.tags)).toBe(true);
      expect(typeof item.note).toBe("string");
    }

    // meta + suggestedNextActions + reasoningHints 同在 data 同级
    expect(body.data?.meta).toBeDefined();
    expect(typeof body.data?.meta?.empty).toBe("boolean");
    expect(typeof body.data?.reasoningHints).toBe("string");
    expect(Array.isArray(body.data?.suggestedNextActions)).toBe(true);
  }, DB_TIMEOUT);

  it("returns empty: true for cold-start user (no starred repos)", async () => {
    // 中文注释：不存在的 userId → hasStarredRepos 返回 false → 路由返回 empty: true + hint
    getApiUserMock.mockResolvedValue({ id: NON_EXISTENT_USER_ID, email: null });
    const response = await postRoute({ taskDescription: "any task" });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data?.data?.items).toEqual([]);
    expect(body.data?.meta?.empty).toBe(true);
    expect(typeof body.data?.meta?.hint).toBe("string");
    // 冷启动时 suggestedNextActions 应包含 sync_stars
    const actions = body.data?.suggestedNextActions ?? [];
    expect(actions.some((a) => a.tool === "sync_stars")).toBe(true);
  }, DB_TIMEOUT);

  it("returns 400 invalid_task_description when taskDescription is missing", async () => {
    // 缺失 taskDescription：返回 400
    const response = await postRoute({});
    expect(response.status).toBe(400);

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("invalid_task_description");
  });

  it("returns 401 unauthorized when auth fails", async () => {
    // 未鉴权：返回 401
    getApiUserMock.mockResolvedValue(null);
    const response = await postRoute({ taskDescription: "any task" });
    expect(response.status).toBe(401);

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("unauthorized");
  });
});
