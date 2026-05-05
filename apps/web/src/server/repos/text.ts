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

export function buildRepoSummary(input: {
  description?: string | null;
  topics?: string[];
  readmeExcerpt?: string | null;
  fullName?: string;
}) {
  const description = cleanMarkdown(input.description ?? "");
  if (description.length >= 32) {
    return description;
  }

  const topicText = input.topics?.length
    ? `Topics: ${input.topics.slice(0, 5).join(", ")}.`
    : "";
  const excerpt = cleanMarkdown(input.readmeExcerpt ?? "");
  const fallback = [description, topicText, excerpt].filter(Boolean).join(" ");

  if (fallback) {
    return fallback.length > 240 ? `${fallback.slice(0, 240).trim()}...` : fallback;
  }

  return input.fullName
    ? `${input.fullName} is a starred GitHub repository.`
    : "Starred GitHub repository.";
}

export function buildSearchDocument(input: {
  fullName: string;
  ownerLogin: string;
  description?: string | null;
  topics?: string[];
  repoSummary?: string | null;
  tags?: string[];
  note?: string | null;
}) {
  return [
    input.fullName,
    input.ownerLogin,
    input.description,
    input.topics?.join(" "),
    input.repoSummary,
    input.tags?.join(" "),
    input.note,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
