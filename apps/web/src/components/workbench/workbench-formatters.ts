export const SOURCE_LABELS: Record<string, string> = {
  github_description: "GitHub original description",
  github_topics: "GitHub topics",
  github_readme: "GitHub README",
  github_readme_excerpt: "GitHub README excerpt",
  repo_metadata: "Repository metadata",
  curation_metadata: "Notes and tags",
  system_fallback: "System fallback",
};

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "Not updated yet";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripBrokenHtmlFragments(input: string) {
  return input
    // Remove complete tags first.
    .replace(/<[^>\n]*>/g, " ")
    // Remove malformed tags that never reached ">" (common in raw README snippets).
    .replace(/<\/?[a-zA-Z][^<\n]*/g, " ")
    // Remove leftover angle brackets.
    .replace(/[<>]/g, " ");
}

export function sanitizeSummaryText(input: string) {
  if (!input) return "";

  const cleaned = stripBrokenHtmlFragments(
    decodeHtmlEntities(input)
      // Remove fenced code blocks while keeping text around it.
      .replace(/```[\s\S]*?```/g, " ")
      // Remove inline code markers.
      .replace(/`([^`]+)`/g, "$1")
      // Convert markdown links and images to visible text.
      .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Strip markdown tables/separators.
      .replace(/[|*_#~]/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}
