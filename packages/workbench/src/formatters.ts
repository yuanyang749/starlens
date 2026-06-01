import type { RepoTextSource } from "@starlens/core";

export const SOURCE_LABELS: Record<RepoTextSource, string> = {
  curation_metadata: "Curation metadata",
  github_description: "GitHub description",
  github_readme: "README",
  github_readme_excerpt: "README excerpt",
  github_topics: "GitHub topics",
  repo_metadata: "Repository metadata",
  system_fallback: "System fallback",
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
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
