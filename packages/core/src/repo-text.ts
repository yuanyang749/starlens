export const REPO_TEXT_FALLBACKS = {
  description: "No GitHub description provided.",
  repoSummary: "No system summary available yet.",
  readmeExcerpt: "No README excerpt indexed yet.",
  searchDocument: "Search document has not been indexed yet.",
  language: "Unknown language",
  licenseName: "No license detected",
  licenseKey: "none",
  defaultBranch: "main",
  visibility: "public" as const,
  date: "1970-01-01T00:00:00.000Z",
  sourceUnknown: "System fallback",
};

export type RepoSummarySource =
  | "github_description"
  | "github_topics"
  | "github_readme"
  | "system_fallback";

export type RepoTextSource =
  | RepoSummarySource
  | "github_readme_excerpt"
  | "repo_metadata"
  | "curation_metadata";

export type RepoSummaryDetails = {
  text: string;
  source: RepoSummarySource;
};

export function cleanMarkdown(input: string) {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractReadmeExcerpt(readme: string, maxLength = 420) {
  const cleaned = cleanMarkdown(readme);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

export function buildRepoSummaryDetails(input: {
  description?: string | null;
  topics?: string[];
  readmeExcerpt?: string | null;
  fullName?: string;
}): RepoSummaryDetails {
  const description = cleanMarkdown(input.description ?? "");
  if (description.length >= 32) {
    return { text: description, source: "github_description" };
  }

  const topicText = input.topics?.length
    ? `Topics: ${input.topics.slice(0, 5).join(", ")}.`
    : "";
  const excerpt = cleanMarkdown(input.readmeExcerpt ?? "");
  const fallback = [description, topicText, excerpt].filter(Boolean).join(" ");

  if (fallback) {
    const source: RepoSummarySource = topicText
      ? "github_topics"
      : excerpt
        ? "github_readme"
        : "github_description";
    return {
      text: fallback.length > 240 ? `${fallback.slice(0, 240).trim()}...` : fallback,
      source,
    };
  }

  return {
    text: input.fullName
      ? `${input.fullName} is a starred GitHub repository.`
      : REPO_TEXT_FALLBACKS.repoSummary,
    source: "system_fallback",
  };
}

export function buildRepoSummary(input: {
  description?: string | null;
  topics?: string[];
  readmeExcerpt?: string | null;
  fullName?: string;
}) {
  return buildRepoSummaryDetails(input).text;
}

export function buildSearchDocument(input: {
  fullName: string;
  ownerLogin: string;
  description?: string | null;
  topics?: string[];
  repoSummary?: string | null;
  readmeExcerpt?: string | null;
  tags?: string[];
  note?: string | null;
}) {
  const document = [
    input.fullName,
    input.ownerLogin,
    input.description,
    input.topics?.join(" "),
    input.repoSummary,
    input.readmeExcerpt,
    input.tags?.join(" "),
    input.note,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return document || REPO_TEXT_FALLBACKS.searchDocument;
}
