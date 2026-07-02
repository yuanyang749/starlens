// 候选精排与上下文构建
// 负责：候选仓库格式化、类型转换

import type {
  RecalledCandidate,
  SearchRepoItem,
} from "./types";

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

// 将 SearchRepoItem 转换为 RecalledCandidate
export function toRecalledCandidate(item: SearchRepoItem, index: number, reason: string): RecalledCandidate {
  return {
    id: item.id, fullName: item.fullName, description: item.description ?? "",
    aiSummary: item.aiSummary, repoSummary: item.repoSummary ?? "",
    userNote: item.note ?? "", topics: item.topics ?? [], tags: item.tags ?? [],
    language: item.language ?? "", stargazersCount: item.stargazersCount ?? 0,
    tsRank: 1, reason, source: "agent_tool_result" as const, score: 1000 - index * 10,
  };
}
