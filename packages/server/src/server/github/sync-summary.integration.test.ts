// get_sync_summary 集成测试 —— 纯 DB 查询（无 AI 调用）
// 中文注释：测试 userId 已经同步过 GitHub stars，覆盖：
//   1. 不传 since → 用 lastSyncAt，返回 added/removed 列表
//   2. 传一个早期时间戳（2020-01-01）→ 应返回较多 added
// 不调用 AI provider，只验证 DB 查询和返回结构。
import { describe, expect, it } from "vitest";
import { getSyncSummary } from "./sync-summary";

// 中文注释：测试 userId（GitHub login: yuanyang749，已同步 182 个 starred repos）。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";

// 中文注释：环境变量缺失时跳过整个文件——CI 环境通常没有本地 DB。
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("getSyncSummary (DB integration)", () => {
  it("uses lastSyncAt when since is omitted", async () => {
    // 不传 since：内部用 githubAccounts.lastSyncFinishedAt 作为 since
    const result = await getSyncSummary(TEST_USER_ID, {});

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(typeof result.data.lastSyncAt === "string" || result.data.lastSyncAt === null).toBe(true);
    expect(typeof result.data.since).toBe("string");
    expect(Array.isArray(result.data.added)).toBe(true);
    expect(Array.isArray(result.data.removed)).toBe(true);
    expect(Array.isArray(result.data.changed)).toBe(true);
    // changed 当前为轻量实现，始终为空数组
    expect(result.data.changed).toEqual([]);
    expect(result.data.totalCount).toEqual({
      added: result.data.added.length,
      removed: result.data.removed.length,
      changed: 0,
    });
    expect(typeof result.meta.empty).toBe("boolean");
    expect(typeof result.reasoningHints).toBe("string");
    expect(Array.isArray(result.suggestedNextActions)).toBe(true);

    // 中文注释：若有新增，suggestedNextActions 应包含 search_stars 引导
    if (result.data.totalCount.added > 0) {
      const searchAction = result.suggestedNextActions.find((a) => a.tool === "search_stars");
      expect(searchAction).toBeDefined();
    }

    // 验证 added 中每项的结构（如有）
    for (const item of result.data.added) {
      expect(typeof item.repoId).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(typeof item.htmlUrl).toBe("string");
      expect(typeof item.stargazersCount).toBe("number");
      expect(typeof item.detectedAt).toBe("string");
    }
  });

  it("returns more added repos when since is an early timestamp", async () => {
    // 中文注释：传 2020-01-01 作为 since——应能覆盖到所有已同步的仓库，
    // added 数量通常 >= 不传 since 时的数量。
    const earlyResult = await getSyncSummary(TEST_USER_ID, { since: "2020-01-01T00:00:00Z" });
    const defaultResult = await getSyncSummary(TEST_USER_ID, {});

    expect(earlyResult).toBeDefined();
    expect(Array.isArray(earlyResult.data.added)).toBe(true);
    // since 字段应被规范化为 ISO 字符串
    expect(earlyResult.data.since).toBe(new Date("2020-01-01T00:00:00Z").toISOString());

    // 中文注释：早期时间戳应能召回所有 last_synced_at 在该时间之后的仓库——
    // 通常等于或超过默认 since（lastSyncAt）的召回量。
    expect(earlyResult.data.added.length).toBeGreaterThanOrEqual(defaultResult.data.added.length);

    // added 中每项的 detectedAt 必须 >= since
    const sinceMs = new Date("2020-01-01T00:00:00Z").getTime();
    for (const item of earlyResult.data.added) {
      const detectedMs = new Date(item.detectedAt).getTime();
      expect(detectedMs).toBeGreaterThanOrEqual(sinceMs);
    }
  });
});
