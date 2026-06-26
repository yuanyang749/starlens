// 候选精排与上下文构建
// 负责：候选仓库格式化、过滤条件描述、类型转换

import type {
  Candidate,
  RankedRepoItem,
  RecalledCandidate,
  SearchRepoItem,
  StructuredIntent,
} from "./types";

// 中文注释：富文本候选上下文，包含 star 数用于排序型问题的回答。
export function buildCandidateContext(candidates: Candidate[]) {
  return candidates
    .map((item, index) => {
      const summary = item.aiSummary?.trim() || item.repoSummary?.trim() || item.description?.trim() || "无";
      const userTags = item.tags.length > 0 ? item.tags : [];
      const githubTopics = item.topics.length > 0 ? item.topics : [];
      const lines = [
        `#${index + 1} ${item.fullName}`,
        `Stars: ${item.stargazersCount.toLocaleString()}`,
        `语言: ${item.language || "unknown"}`,
        `摘要: ${summary}`,
      ];
      if (item.description?.trim() && item.description !== summary) {
        lines.push(`描述: ${item.description}`);
      }
      if (item.userNote?.trim()) {
        lines.push(`用户备注: ${item.userNote}`);
      }
      if (userTags.length > 0) {
        lines.push(`用户标签: ${userTags.join(", ")}`);
      }
      if (githubTopics.length > 0) {
        lines.push(`GitHub 话题: ${githubTopics.slice(0, 5).join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

// 单仓库分析：提供更丰富的上下文（含 readmeExcerpt）
export function buildSingleRepoContext(repo: SearchRepoItem): string {
  const lines: string[] = [
    `仓库：${repo.fullName}`,
    `Stars: ${(repo.stargazersCount ?? 0).toLocaleString()}`,
    `语言: ${repo.language || "unknown"}`,
    `主页: ${repo.htmlUrl ?? ""}`,
  ];
  if (repo.description?.trim()) lines.push(`简介: ${repo.description}`);
  if (repo.aiSummary?.trim()) lines.push(`AI 摘要: ${repo.aiSummary}`);
  else if (repo.repoSummary?.trim()) lines.push(`摘要: ${repo.repoSummary}`);
  if (repo.readmeExcerpt?.trim()) lines.push(`README 摘录:\n${repo.readmeExcerpt.slice(0, 1200)}`);
  if ((repo.topics ?? []).length > 0) lines.push(`话题标签: ${(repo.topics ?? []).join(", ")}`);
  if (repo.note?.trim()) lines.push(`用户备注: ${repo.note}`);
  return lines.join("\n");
}

// 生成过滤条件的中文描述
export function buildFilterDesc(si: StructuredIntent): string {
  const parts: string[] = [];
  if (si.language) parts.push(`${si.language} 语言`);
  if (si.owner) parts.push(`${si.owner} 作者`);
  if (si.favorite) parts.push("已收藏");
  if (si.tag) parts.push(`"${si.tag}" 标签`);
  if (si.hasNote) parts.push("有备注");
  if (si.noteContains) parts.push(`备注含 "${si.noteContains}"`);
  if (si.minStars !== undefined) parts.push(`Star ≥ ${si.minStars.toLocaleString()}`);
  if (si.maxStars !== undefined) parts.push(`Star ≤ ${si.maxStars.toLocaleString()}`);
  if (si.q) parts.push(`"${si.q}"`);
  return parts.length > 0 ? `（${parts.join("、")}）` : "";
}

// 将 SearchRepoItem 转换为 RecalledCandidate
export function toRecalledCandidate(item: SearchRepoItem, index: number, reason: string): RecalledCandidate {
  return {
    id: item.id, fullName: item.fullName, description: item.description ?? "",
    aiSummary: item.aiSummary, repoSummary: item.repoSummary ?? "",
    userNote: item.note ?? "", topics: item.topics ?? [], tags: item.tags ?? [],
    language: item.language ?? "", stargazersCount: item.stargazersCount ?? 0,
    tsRank: 1, reason, source: "question_search" as const, score: 1000 - index * 10,
  };
}

export function toCandidate(item: SearchRepoItem | RankedRepoItem): Candidate {
  const tsRank = "tsRank" in item ? (item.tsRank as number) : 0;
  return {
    id: item.id,
    fullName: item.fullName,
    description: item.description,
    aiSummary: item.aiSummary,
    repoSummary: item.repoSummary,
    userNote: item.note ?? "",
    topics: item.topics,
    tags: item.tags,
    language: item.language,
    stargazersCount: item.stargazersCount,
    tsRank,
  };
}
