import { describe, expect, it } from "vitest";
import { getRepoStats } from "./repository";

const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("dashboard stats (DB integration)", () => {
  it("返回完整且可直接渲染的收藏洞察", async () => {
    const stats = await getRepoStats(TEST_USER_ID);

    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.monthlyTrend).toHaveLength(12);
    expect(stats.attention.total).toBeGreaterThanOrEqual(stats.attentionRepos.length);
    expect(stats.attentionRepos.every((repo) => repo.reasons.length > 0)).toBe(true);
    expect(stats.topStarredRepos).toHaveLength(Math.min(stats.total, 10));
  });
});
