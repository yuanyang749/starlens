"use client";

import type { RepoSummary } from "@starlens/core";
import { FolderGit2, Heart, Pin, Star, Tag } from "lucide-react";
import { formatCompactNumber, formatDate } from "./workbench-formatters";

type RepoTableRowProps = {
  repo: RepoSummary;
  selected: boolean;
  onSelect: () => void;
};

export function RepoTableRow({ repo, selected, onSelect }: RepoTableRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={selected ? "repo-table-row is-selected" : "repo-table-row"}
    >
      <span className="repo-table-row__select" aria-hidden="true" />
      <div className="repo-table-row__repo">
        <div className="repo-table-row__title">
          <FolderGit2 className="h-4 w-4" />
          <span>{repo.fullName}</span>
        </div>
        <p className="repo-table-row__summary">{repo.repoSummary}</p>
      </div>
      <span className="repo-table-row__metric">{formatCompactNumber(repo.stargazersCount)}</span>
      <span className="repo-table-row__language">
        <span className="repo-language-dot" aria-hidden="true" />
        {repo.language || "Unknown"}
      </span>
      <span className="repo-table-row__updated">{formatDate(repo.pushedAtGithub)}</span>
      <span className="repo-table-row__tags">
        {repo.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="repo-chip">
            <Tag className="h-3 w-3" />
            {tag}
          </span>
        ))}
      </span>
      <span className="repo-table-row__favorite" aria-label={repo.isFavorite ? "Favorited" : "Favorite"}>
        {repo.isFavorite ? <Star className="h-4 w-4 fill-current" /> : <Heart className="h-4 w-4" />}
      </span>
      <span className="repo-table-row__pin" aria-hidden="true">
        <Pin className="h-4 w-4" />
      </span>
    </button>
  );
}
