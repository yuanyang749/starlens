// suggest_organization 集成测试 —— 纯 DB 聚合（无 AI 调用）
// 中文注释：测试 userId 有 182 个 starred repos，覆盖 focus=stale/untagged/all 三个分支。
// 不调用 AI provider，只验证 DB 查询和返回结构。
import { describe, expect, it } from "vitest";
import { suggestOrganization } from "./organization";

// 中文注释：测试 userId（182 个 starred repos）。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";

// 中文注释：环境变量缺失时跳过整个文件——CI 环境通常没有本地 DB。
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("suggestOrganization (DB integration)", () => {
  it("returns stale repos when focus=stale", async () => {
    // focus=stale：返回 pushed_at_github 超 2 年的仓库（如有）
    const result = await suggestOrganization(TEST_USER_ID, { focus: "stale" });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data.items)).toBe(true);
    expect(typeof result.meta.empty).toBe("boolean");
    expect(typeof result.reasoningHints).toBe("string");
    expect(result.reasoningHints).toContain("stale");
    expect(Array.isArray(result.suggestedNextActions)).toBe(true);

    // 中文注释：stale 仓库不一定会存在（取决于用户收藏的新鲜度）。
    // 若有结果，每项的 issue 必为 "stale"。
    for (const item of result.data.items) {
      expect(item.issue).toBe("stale");
      expect(typeof item.repoId).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(typeof item.suggestion).toBe("string");
      expect(item.detail?.pushedAtGithub === null || typeof item.detail?.pushedAtGithub === "string")
        .toBe(true);
    }
  });

  it("returns untagged high-star repos when focus=untagged", async () => {
    // focus=untagged：返回 star>1000 且无 user_tags 的仓库
    const result = await suggestOrganization(TEST_USER_ID, { focus: "untagged" });

    expect(result).toBeDefined();
    expect(Array.isArray(result.data.items)).toBe(true);
    expect(result.reasoningHints).toContain("untagged");

    // 中文注释：测试用户有 Real-ESRGAN (36013 stars) 等高 star 仓库，
    // 至少应能找到一些 untagged 仓库——但具体数量取决于用户是否打过标签。
    // 这里只验证结构：每项 issue 必为 "untagged"，star 数 > 1000。
    for (const item of result.data.items) {
      expect(item.issue).toBe("untagged");
      expect(typeof item.repoId).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(item.detail?.stargazersCount).toBeGreaterThan(1000);
    }

    // 中文注释：若有 untagged 建议，suggestedNextActions 第一项应为 show_star 指向第一个 untagged repoId。
    if (result.data.items.length > 0) {
      expect(result.suggestedNextActions.length).toBeGreaterThan(0);
      const firstAction = result.suggestedNextActions[0]!;
      expect(firstAction.tool).toBe("show_star");
      expect(firstAction.args.repo).toBe(result.data.items[0]!.repoId);
    }
  });

  it("returns all three issue types merged when focus=all", async () => {
    // focus=all：duplicates + stale + untagged 三个维度合并
    const result = await suggestOrganization(TEST_USER_ID, { focus: "all" });

    expect(result).toBeDefined();
    expect(Array.isArray(result.data.items)).toBe(true);
    expect(result.reasoningHints).toContain("duplicates");
    expect(result.reasoningHints).toContain("stale");
    expect(result.reasoningHints).toContain("untagged");

    // 中文注释：合并后的 items 中 issue 字段只能是这三个值之一
    const validIssues = new Set(["duplicate", "stale", "untagged"]);
    for (const item of result.data.items) {
      expect(validIssues.has(item.issue)).toBe(true);
      expect(typeof item.repoId).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(typeof item.suggestion).toBe("string");
    }
  });
});
