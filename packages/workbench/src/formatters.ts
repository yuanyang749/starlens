import type { RepoTextSource } from "@starlens-app/core";

export const SOURCE_LABELS: Record<RepoTextSource, string> = {
  curation_metadata: "备注与标签",
  github_description: "GitHub 描述",
  github_readme: "README",
  github_readme_excerpt: "README 摘要",
  github_topics: "GitHub Topics",
  repo_metadata: "仓库元数据",
  system_fallback: "系统兜底",
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "未知";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeSummaryText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
