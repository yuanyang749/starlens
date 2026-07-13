export type MonthlyTrendPoint = { month: string; count: number };

export const DASHBOARD_COMMUNITY_REPO_LIMIT = 10;

export type AttentionCandidate = {
  archived: boolean;
  disabled: boolean;
  language: string | null;
  pushedAtGithub: Date | null;
  hasTags: boolean;
};

export function toIsoDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);

  // 中文注释：PostgreSQL 聚合函数可能绕过列级映射并返回字符串，统一在响应边界规范化。
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function completeMonthlyTrend(
  rows: MonthlyTrendPoint[],
  now = new Date(),
  monthCount = 12,
): MonthlyTrendPoint[] {
  const counts = new Map(rows.map((row) => [row.month, row.count]));

  // 中文注释：从当前月向前构造固定窗口，避免没有收藏的月份消失，也保证跨年顺序稳定。
  return Array.from({ length: monthCount }, (_, index) => {
    const monthsAgo = monthCount - index - 1;
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
    const month = monthKey(date);
    return { month, count: counts.get(month) ?? 0 };
  });
}

export function buildAttentionReasons(candidate: AttentionCandidate, now = new Date()): string[] {
  const reasons: string[] = [];
  const staleBefore = new Date(now);
  staleBefore.setUTCFullYear(staleBefore.getUTCFullYear() - 2);

  if (candidate.archived) reasons.push("已归档");
  if (candidate.disabled) reasons.push("已停用");
  if (!candidate.pushedAtGithub || candidate.pushedAtGithub < staleBefore) reasons.push("长期未更新");
  if (!candidate.language) reasons.push("元数据缺失");
  if (!candidate.hasTags) reasons.push("未分类");

  return reasons;
}
