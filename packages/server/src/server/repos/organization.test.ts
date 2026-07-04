// suggest_organization 业务逻辑单元测试
// 中文注释：mock 掉 getDb 返回的 drizzle 链式查询，验证 focus 路由、空结果、
// suggestedNextActions 生成等纯逻辑分支。不测真实 DB 查询。
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted 保证 mock 状态在 vi.mock 工厂内可访问（vi.mock 会被提升到文件顶部）
const { dbSelectMock, rowsQueue } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  rowsQueue: [] as unknown[][],
}));

vi.mock("../../db/client", () => ({
  getDb: vi.fn(() => ({ select: dbSelectMock })),
}));

// 中文注释：每次 db.select() 调用从 rowsQueue 取一组预置行，构造一个支持
// .from().where().limit() 和 .from().where().orderBy().limit() 的链式 mock。
function refreshSelectMock() {
  dbSelectMock.mockImplementation(() => {
    const rows = rowsQueue.shift() ?? [];
    const limit = vi.fn(async () => rows);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ limit, orderBy }));
    const from = vi.fn(() => ({ where }));
    return { from };
  });
}

// 动态 import 让 vi.mock 先生效
async function loadModule() {
  return await import("./organization");
}

describe("suggestOrganization", () => {
  beforeEach(() => {
    rowsQueue.length = 0;
    dbSelectMock.mockClear();
    refreshSelectMock();
  });

  it("runs only findDuplicates when focus=duplicates", async () => {
    // focus=duplicates：只调用 findDuplicates，select 仅被调一次
    rowsQueue.push([
      { repoId: "r1", fullName: "dup/repo", stargazersCount: 10, language: "Go", lastSyncedAt: new Date("2025-01-01") },
      { repoId: "r2", fullName: "dup/repo", stargazersCount: 10, language: "Go", lastSyncedAt: new Date("2025-01-02") },
    ]);
    const { suggestOrganization } = await loadModule();

    const result = await suggestOrganization("user-1", { focus: "duplicates" });

    expect(dbSelectMock).toHaveBeenCalledTimes(1);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.issue).toBe("duplicate");
    expect(result.data.items[0]?.fullName).toBe("dup/repo");
    expect(result.meta.empty).toBe(false);
  });

  it("runs only findStale when focus=stale", async () => {
    // focus=stale：只调用 findStale
    rowsQueue.push([
      {
        repoId: "r1",
        fullName: "stale/repo",
        stargazersCount: 5,
        language: "Ruby",
        pushedAtGithub: new Date("2020-01-01"),
        lastSyncedAt: new Date("2025-01-01"),
      },
    ]);
    const { suggestOrganization } = await loadModule();

    const result = await suggestOrganization("user-2", { focus: "stale" });

    expect(dbSelectMock).toHaveBeenCalledTimes(1);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.issue).toBe("stale");
    expect(result.data.items[0]?.detail?.pushedAtGithub).toBe("2020-01-01T00:00:00.000Z");
  });

  it("runs all three dimensions when focus=all", async () => {
    // focus=all：三个维度都调用，select 被调三次
    rowsQueue.push(
      [
        { repoId: "d1", fullName: "dup/x", stargazersCount: 1, language: null, lastSyncedAt: null },
        { repoId: "d2", fullName: "dup/x", stargazersCount: 1, language: null, lastSyncedAt: new Date("2025-01-01") },
      ],
      [
        {
          repoId: "s1",
          fullName: "stale/y",
          stargazersCount: 2,
          language: "C",
          pushedAtGithub: new Date("2019-06-01"),
          lastSyncedAt: null,
        },
      ],
      [
        { repoId: "u1", fullName: "untagged/z", stargazersCount: 5000, language: "Rust", topics: ["db"] },
      ],
    );
    const { suggestOrganization } = await loadModule();

    const result = await suggestOrganization("user-3", { focus: "all" });

    expect(dbSelectMock).toHaveBeenCalledTimes(3);
    // duplicates 1 + stale 1 + untagged 1 = 3
    expect(result.data.items).toHaveLength(3);
    const issues = result.data.items.map((i) => i.issue).sort();
    expect(issues).toEqual(["duplicate", "stale", "untagged"]);
  });

  it("returns meta.empty=true when no issues found", async () => {
    // 空结果：meta.empty=true，并带 hint
    rowsQueue.push([]);
    const { suggestOrganization } = await loadModule();

    const result = await suggestOrganization("user-4", { focus: "duplicates" });

    expect(result.data.items).toEqual([]);
    expect(result.meta.empty).toBe(true);
    expect(result.meta.hint).toBeTruthy();
  });

  it("includes show_star next action for the first untagged suggestion", async () => {
    // 有 untagged 建议时，suggestedNextActions 第一项应为 show_star，指向该 untagged repoId
    rowsQueue.push([
      { repoId: "u-first", fullName: "untagged/first", stargazersCount: 8000, language: "Zig", topics: [] },
    ]);
    const { suggestOrganization } = await loadModule();

    const result = await suggestOrganization("user-5", { focus: "untagged" });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.issue).toBe("untagged");
    expect(result.suggestedNextActions).toHaveLength(1);
    expect(result.suggestedNextActions[0]?.tool).toBe("show_star");
    expect(result.suggestedNextActions[0]?.args.repo).toBe("u-first");
  });

  it("omits next actions when no untagged suggestion exists", async () => {
    // 只有 duplicate/stale 建议时，suggestedNextActions 为空（spec 仅对 untagged 给示范 action）
    rowsQueue.push([
      {
        repoId: "s1",
        fullName: "stale/y",
        stargazersCount: 2,
        language: "C",
        pushedAtGithub: new Date("2019-06-01"),
        lastSyncedAt: null,
      },
    ]);
    const { suggestOrganization } = await loadModule();

    const result = await suggestOrganization("user-6", { focus: "stale" });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.issue).toBe("stale");
    expect(result.suggestedNextActions).toEqual([]);
  });

  it("reasoningHints mentions the scanned focus dimension", async () => {
    // reasoningHints 应包含当前 focus 维度描述
    rowsQueue.push([]);
    const { suggestOrganization } = await loadModule();

    const dup = await suggestOrganization("user-7a", { focus: "duplicates" });
    expect(dup.reasoningHints).toContain("duplicates");

    rowsQueue.push([]);
    const all = await suggestOrganization("user-7b", { focus: "all" });
    expect(all.reasoningHints).toContain("duplicates");
    expect(all.reasoningHints).toContain("stale");
    expect(all.reasoningHints).toContain("untagged");
  });
});
