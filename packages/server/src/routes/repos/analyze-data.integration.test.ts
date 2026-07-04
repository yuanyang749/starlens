// analyze-data 路由层集成测试 —— 直连真实 DB
// 中文注释：本文件验证 /api/repos/analyze-data 路由的端到端行为：
//   1. 已 star 仓库：返回原始 README / topics / repoSummary，applied=false
//   2. 不存在的仓库：返回 404 + repo_not_found
//   3. 参数校验：缺失 repo 参数返回 400
// 路由层直接调用（不通过 HTTP），mock 掉 getApiUser 绕过鉴权，DB 查询走真实数据库（只读）。
/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 中文注释：测试 userId（GitHub login: yuanyang749，182 个 starred repos）和样本仓库 id 来自本地开发库。
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

// 中文注释：GitHub API 调用可能慢，单测超时设为 30s。
const DB_TIMEOUT = 30_000;

async function postRoute(body: unknown) {
  const { POST } = await import("./analyze-data/route");
  const response = await POST(
    new Request("https://starlens.test/api/repos/analyze-data", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  return response;
}

// 中文注释：ok() 包裹后响应结构是 { ok, data: { data: { repo, isStarred, applied }, meta, suggestedNextActions, reasoningHints } }。
// data 同级包含四段：data（业务数据）/ meta / suggestedNextActions / reasoningHints。
type ResponseBody = {
  ok: boolean;
  data?: {
    data?: {
      repo: {
        id: string | null;
        fullName: string;
        readmeExcerpt: string;
        repoSummary: string;
        topics: string[];
      };
      isStarred: boolean;
      applied: boolean;
    };
    meta?: { empty: boolean };
    suggestedNextActions?: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
    reasoningHints?: string;
  };
  error?: { code: string; message: string };
};

async function json(response: Response) {
  return (await response.json()) as ResponseBody;
}

describeDb("POST /api/repos/analyze-data (route integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: TEST_USER_ID, email: null });
  });

  it("returns raw repo metadata for an already-starred repo", async () => {
    // 已 star 仓库：应返回本地存储的 README、topics、repoSummary，applied=false
    const response = await postRoute({ repo: REAL_ESRGAN_FULL_NAME });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();

    const repoData = body.data?.data;
    expect(repoData).toBeDefined();
    expect(repoData?.repo.fullName).toBe(REAL_ESRGAN_FULL_NAME);
    expect(repoData?.repo.id).toBe(REAL_ESRGAN_ID);
    expect(repoData?.isStarred).toBe(true);
    expect(repoData?.applied).toBe(false);
    // README 摘要和 repoSummary 是字符串（不验证具体内容，会变）
    expect(typeof repoData?.repo.readmeExcerpt).toBe("string");
    expect(typeof repoData?.repo.repoSummary).toBe("string");
    expect(Array.isArray(repoData?.repo.topics)).toBe(true);

    // meta + suggestedNextActions + reasoningHints 同在 data 同级
    expect(body.data?.meta?.empty).toBe(false);
    expect(typeof body.data?.reasoningHints).toBe("string");
    expect(Array.isArray(body.data?.suggestedNextActions)).toBe(true);
  }, DB_TIMEOUT);

  it("returns 404 repo_not_found for non-existent owner/repo", async () => {
    // 中文注释：不存在的 owner/repo——路由会尝试调 GitHub API，GitHub 返回 404，
    // fetchRepoFromGitHub 抛 "Repository ... was not found"，路由转成 404 repo_not_found。
    // 但这依赖 GitHub token 有效。如果 token 失效会返回 422 github_not_connected。
    // 这里只验证"非 200 + ok=false"，不绑定具体错误码（取决于 GitHub token 状态）。
    const response = await postRoute({ repo: "nonexistent-user/no-such-repo-xyz123" });
    expect(response.status).toBeGreaterThanOrEqual(400);

    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
    expect(typeof body.error?.code).toBe("string");
  }, DB_TIMEOUT);

  it("returns 400 invalid_repo when repo parameter is missing", async () => {
    // 缺失 repo 参数：返回 400 + invalid_repo
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
