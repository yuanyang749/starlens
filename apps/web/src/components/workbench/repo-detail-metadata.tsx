import type { RepoSummary } from "@starlens/core";
import { CalendarClock, FolderGit2, Globe, Scale, Star } from "lucide-react";
import { formatCompactNumber, formatDateTime } from "./workbench-formatters";

type RepoDetailMetadataProps = {
  repo: RepoSummary;
};

export function RepoDetailMetadata({ repo }: RepoDetailMetadataProps) {
  const items = [
    { label: `${formatCompactNumber(repo.stargazersCount)} Stars`, icon: Star },
    { label: repo.language || "未知", icon: Globe },
    { label: repo.license.name, icon: Scale },
    { label: `更新 ${formatDateTime(repo.updatedAtGithub)}`, icon: CalendarClock },
    { label: `创建 ${formatDateTime(repo.createdAtGithub)}`, icon: CalendarClock },
    { label: `推送 ${formatDateTime(repo.pushedAtGithub)}`, icon: CalendarClock },
    { label: `关注 ${formatCompactNumber(repo.watchersCount)}`, icon: FolderGit2 },
    { label: `分支 ${repo.defaultBranch}`, icon: FolderGit2 },
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
