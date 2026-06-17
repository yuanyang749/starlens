import type { RepoSummary } from "@starlens-app/core";
import { CalendarPlus, Code, Eye, GitBranch, GitCommitHorizontal, RefreshCw, Scale, Star } from "lucide-react";
import { formatCompactNumber, formatDateTime } from "./workbench-formatters";

type RepoDetailMetadataProps = {
  repo: RepoSummary;
};

export function RepoDetailMetadata({ repo }: RepoDetailMetadataProps) {
  const items = [
    { label: `${formatCompactNumber(repo.stargazersCount)} Stars`, icon: Star },
    { label: repo.language || "未知", icon: Code },
    { label: repo.license.name, icon: Scale },
    { label: `更新 ${formatDateTime(repo.updatedAtGithub)}`, icon: RefreshCw },
    { label: `创建 ${formatDateTime(repo.createdAtGithub)}`, icon: CalendarPlus },
    { label: `推送 ${formatDateTime(repo.pushedAtGithub)}`, icon: GitCommitHorizontal },
    { label: `关注 ${formatCompactNumber(repo.watchersCount)}`, icon: Eye },
    { label: `分支 ${repo.defaultBranch}`, icon: GitBranch },
  ];

  return (
    <div className="repo-detail-metadata">
      {items.map(({ label, icon: Icon }) => (
        <span key={label} className="repo-detail-stat">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
      ))}
    </div>
  );
}
