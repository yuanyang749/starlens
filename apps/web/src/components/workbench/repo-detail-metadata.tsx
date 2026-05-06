import type { RepoSummary } from "@starlens/core";
import { CalendarClock, FolderGit2, Globe, Scale, Star } from "lucide-react";
import { formatCompactNumber, formatDateTime } from "./workbench-formatters";

type RepoDetailMetadataProps = {
  repo: RepoSummary;
};

export function RepoDetailMetadata({ repo }: RepoDetailMetadataProps) {
  const items = [
    { label: `${formatCompactNumber(repo.stargazersCount)} stars`, icon: Star },
    { label: repo.language || "Unknown", icon: Globe },
    { label: repo.license.name, icon: Scale },
    { label: `Updated ${formatDateTime(repo.updatedAtGithub)}`, icon: CalendarClock },
    { label: `Created ${formatDateTime(repo.createdAtGithub)}`, icon: CalendarClock },
    { label: `Pushed ${formatDateTime(repo.pushedAtGithub)}`, icon: CalendarClock },
    { label: `Watchers ${formatCompactNumber(repo.watchersCount)}`, icon: FolderGit2 },
    { label: `Branch ${repo.defaultBranch}`, icon: FolderGit2 },
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
