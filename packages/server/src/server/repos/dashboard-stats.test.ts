import { describe, expect, it } from "vitest";
import {
  DASHBOARD_COMMUNITY_REPO_LIMIT,
  buildAttentionReasons,
  completeMonthlyTrend,
  toIsoDateString,
} from "./dashboard-stats";

describe("dashboard stats", () => {
  it("社区热门固定展示 10 个仓库", () => {
    expect(DASHBOARD_COMMUNITY_REPO_LIMIT).toBe(10);
  });

  it("补齐跨年的最近 12 个月并保持时间顺序", () => {
    const trend = completeMonthlyTrend(
      [
        { month: "2025-08", count: 2 },
        { month: "2026-01", count: 4 },
        { month: "2026-07", count: 3 },
      ],
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(trend).toHaveLength(12);
    expect(trend[0]).toEqual({ month: "2025-08", count: 2 });
    expect(trend[5]).toEqual({ month: "2026-01", count: 4 });
    expect(trend[10]).toEqual({ month: "2026-06", count: 0 });
    expect(trend[11]).toEqual({ month: "2026-07", count: 3 });
  });

  it("为需要整理的仓库生成清晰且不重复的关注原因", () => {
    const reasons = buildAttentionReasons(
      {
        archived: true,
        disabled: false,
        language: null,
        pushedAtGithub: new Date("2022-01-01T00:00:00.000Z"),
        hasTags: false,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(reasons).toEqual(["已归档", "长期未更新", "元数据缺失", "未分类"]);
  });

  it("不会把近期活跃且已整理的仓库误判为待关注", () => {
    const reasons = buildAttentionReasons(
      {
        archived: false,
        disabled: false,
        language: "TypeScript",
        pushedAtGithub: new Date("2026-07-01T00:00:00.000Z"),
        hasTags: true,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(reasons).toEqual([]);
  });

  it("兼容 PostgreSQL 聚合返回的日期字符串", () => {
    expect(toIsoDateString("2026-07-13 06:30:00+00")).toBe("2026-07-13T06:30:00.000Z");
    expect(toIsoDateString(new Date("2026-07-13T06:30:00.000Z"))).toBe("2026-07-13T06:30:00.000Z");
    expect(toIsoDateString(null)).toBeNull();
  });
});
