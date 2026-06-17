"use client";

import type { RepoSummary } from "@starlens/core";
import { KeyboardEvent } from "react";
import { FolderGit2, Heart, Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCompactNumber, formatDate } from "./workbench-formatters";

type RepoTableRowProps = {
  repo: RepoSummary;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: (repo: RepoSummary) => Promise<void>;
  favoriteUpdating: boolean;
};

export function RepoTableRow({
  repo,
  selected,
  onSelect,
  onToggleFavorite,
  favoriteUpdating,
}: RepoTableRowProps) {
  const displayTags = repo.tags.slice(0, 3);
  const favoriteTitle = repo.isFavorite ? "取消收藏" : "加入收藏";

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={selected ? "repo-table-row is-selected" : "repo-table-row"}
    >
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
        {repo.language || "未知"}
      </span>
      <span className="repo-table-row__updated">{formatDate(repo.pushedAtGithub)}</span>
      <span className="repo-table-row__tags">
        {displayTags.length > 0 ? displayTags.map((tag) => (
          <span key={tag} className="repo-chip">
            {tag}
          </span>
        )) : <span className="repo-table-row__tag-empty">—</span>}
      </span>
      <span className="repo-table-row__actions">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={favoriteTitle}
              disabled={favoriteUpdating}
              className="repo-table-row__action-button repo-table-row__favorite"
              onClick={(event) => {
                event.stopPropagation();
                void onToggleFavorite(repo);
              }}
            >
              {repo.isFavorite ? <Star className="h-4 w-4 fill-current" /> : <Heart className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <span>{favoriteTitle}</span>
          </TooltipContent>
        </Tooltip>
      </span>
    </div>
  );
}
