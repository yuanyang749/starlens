// get_sync_summary 业务逻辑单元测试
// 中文注释：mock 掉 getDb 返回的 drizzle 查询（findFirst + select 链式），
// 验证"从未同步"、"since 无效降级"、"无 since 且无 lastSyncAt"、正常摘要等边界分支。
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted 让 mock 状态在 vi.mock 工厂内可访问
const { findFirstMock, dbSelectMock, rowsQueue } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  dbSelectMock: vi.fn(),
  rowsQueue: [] as unknown[][],
}));

vi.mock("../../db/client", () => ({
  getDb: vi.fn(() => ({
    query: { githubAccounts: { findFirst: findFirstMock } },
    select: dbSelectMock,
  })),
}));

// 中文注释：与 organization.test.ts 类似的链式 mock——每次 select 从 rowsQueue 取一组预置行。
// added 查询在前，removed 查询在后（getSyncSummary 内先查 added 再查 removed）。
function refreshSelectMock() {
  dbSelectMock.mockImplementation(() => {
    const rows = rowsQueue.shift() ?? [];
    const limit = vi.fn(async () => rows);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    return { from };
  });
}

async function loadModule() {
  return await import("./sync-summary");
}

describe("getSyncSummary", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    dbSelectMock.mockClear();
    rowsQueue.length = 0;
    refreshSelectMock();
  });

  it("returns empty=true with sync hint when user never synced", async () => {
    // 用户从未同步：无 githubAccount 记录，lastSyncAt=null，返回 empty=true 并提示先 sync_stars
    findFirstMock.mockResolvedValue(undefined);
    const { getSyncSummary } = await loadModule();

    const result = await getSyncSummary("user-never", {});

    expect(result.meta.empty).toBe(true);
    expect(result.meta.hint).toBeTruthy();
    expect(result.suggestedNextActions).toHaveLength(1);
    expect(result.suggestedNextActions[0]?.tool).toBe("sync_stars");
    expect(result.data.lastSyncAt).toBeNull();
    expect(result.data.totalCount).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("falls back to lastSyncAt when since is invalid", async () => {
    // since 参数无法解析为日期时，降级用 lastSyncAt
    const lastSync = new Date("2025-01-01T00:00:00Z");
    findFirstMock.mockResolvedValue({ lastSyncFinishedAt: lastSync });
    // added/removed 查询都返回空
    rowsQueue.push([], []);
    const { getSyncSummary } = await loadModule();

    const result = await getSyncSummary("user-invalid-since", { since: "not-a-date" });

    // since 应降级为 lastSyncAt 的 ISO 字符串
    expect(result.data.since).toBe(lastSync.toISOString());
    expect(result.data.lastSyncAt).toBe(lastSync.toISOString());
    expect(result.meta.empty).toBe(true);
  });

  it("returns empty=true when no since and no lastSyncAt", async () => {
    // 既无 since 又无 lastSyncAt（account 存在但 lastSyncFinishedAt 为 null）
    findFirstMock.mockResolvedValue({ lastSyncFinishedAt: null });
    const { getSyncSummary } = await loadModule();

    const result = await getSyncSummary("user-no-since", {});

    expect(result.meta.empty).toBe(true);
    expect(result.data.totalCount).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("uses user-provided since when it is a valid date", async () => {
    // 用户传了合法 since：用用户的，不依赖 lastSyncAt
    const lastSync = new Date("2025-01-01T00:00:00Z");
    findFirstMock.mockResolvedValue({ lastSyncFinishedAt: lastSync });
    rowsQueue.push([], []);
    const { getSyncSummary } = await loadModule();

    const since = "2025-06-01T00:00:00Z";
    const result = await getSyncSummary("user-valid-since", { since });

    // getSyncSummary 内部用 new Date(since).toISOString() 规范化，会带上毫秒
    expect(result.data.since).toBe(new Date(since).toISOString());
    // lastSyncAt 仍来自 account，不被 since 覆盖
    expect(result.data.lastSyncAt).toBe(lastSync.toISOString());
  });

  it("returns added/removed items and search_stars next action when there are additions", async () => {
    // 正常场景：有新增仓库时返回非空摘要，并建议用 search_stars 浏览
    const lastSync = new Date("2025-01-01T00:00:00Z");
    findFirstMock.mockResolvedValue({ lastSyncFinishedAt: lastSync });
    rowsQueue.push(
      [
        {
          repoId: "added-1",
          fullName: "new/repo",
          description: "a new repo",
          htmlUrl: "https://github.com/new/repo",
          stargazersCount: 42,
          language: "Go",
          detectedAt: new Date("2025-06-02"),
        },
      ],
      [
        {
          repoId: "removed-1",
          fullName: "old/repo",
          description: null,
          htmlUrl: "https://github.com/old/repo",
          stargazersCount: 3,
          language: null,
          detectedAt: new Date("2025-06-03"),
        },
      ],
    );
    const { getSyncSummary } = await loadModule();

    const result = await getSyncSummary("user-with-changes", {});

    expect(result.meta.empty).toBe(false);
    expect(result.data.totalCount).toEqual({ added: 1, removed: 1, changed: 0 });
    expect(result.data.added[0]?.fullName).toBe("new/repo");
    expect(result.data.added[0]?.detectedAt).toBe("2025-06-02T00:00:00.000Z");
    expect(result.data.removed[0]?.fullName).toBe("old/repo");
    // changed 始终为空（轻量实现，需 sync_changes 表才能精确区分）
    expect(result.data.changed).toEqual([]);
    // 有新增时应建议 search_stars
    expect(result.suggestedNextActions).toHaveLength(1);
    expect(result.suggestedNextActions[0]?.tool).toBe("search_stars");
  });

  it("returns empty when both added and removed are empty", async () => {
    // 自上次同步以来无仓库变化：empty=true 并带 hint
    const lastSync = new Date("2025-01-01T00:00:00Z");
    findFirstMock.mockResolvedValue({ lastSyncFinishedAt: lastSync });
    rowsQueue.push([], []);
    const { getSyncSummary } = await loadModule();

    const result = await getSyncSummary("user-no-changes", {});

    expect(result.meta.empty).toBe(true);
    expect(result.meta.hint).toBeTruthy();
    expect(result.suggestedNextActions).toEqual([]);
  });
});
