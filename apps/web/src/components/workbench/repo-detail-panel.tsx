"use client";

import { useState } from "react";
import type { RepoSummary } from "@starlens/core";
import { Bot, Check, ExternalLink, Globe, Plus, Star, X } from "lucide-react";
import {
  SOURCE_LABELS,
  formatDateTime,
  safeExternalUrl,
  sanitizeSummaryText,
} from "./workbench-formatters";
import { RepoDetailMetadata } from "./repo-detail-metadata";

function CollapsibleText({
  text,
  className = "",
  limit = 240,
}: {
  text: string;
  className?: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = text.length > limit;
  const visibleText = shouldCollapse && !expanded ? `${text.slice(0, limit).trim()}...` : text;

  return (
    <div>
      <p className={className}>{visibleText}</p>
      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="repo-detail-link"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      ) : null}
    </div>
  );
}

type RepoDetailPanelProps = {
  repo: RepoSummary | null;
  noteDraft: string;
  newTag: string;
  favoriteUpdating: boolean;
  tagSubmitting: boolean;
  tagDeleting: string | null;
  noteSaveFeedback: string | null;
  onFavoriteToggle: () => Promise<void>;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  onNewTagChange: (value: string) => void;
  onAddTag: () => Promise<void>;
  onDeleteTag: (tag: string) => Promise<void>;
};

export function RepoDetailPanel({
  repo,
  noteDraft,
  newTag,
  favoriteUpdating,
  tagSubmitting,
  tagDeleting,
  noteSaveFeedback,
  onFavoriteToggle,
  onNoteChange,
  onSaveNote,
  onNewTagChange,
  onAddTag,
  onDeleteTag,
}: RepoDetailPanelProps) {
  if (!repo) {
    return (
      <aside data-testid="repo-detail-panel" className="repo-detail-panel repo-detail-panel--empty">
        <div>
          <p className="repo-detail-panel__eyebrow">Selected repository</p>
          <p className="repo-detail-panel__empty-title">Select a repository</p>
          <p className="repo-detail-panel__empty-copy">
            Choose a repo from the table to inspect metadata, notes, tags, and summaries.
          </p>
        </div>
      </aside>
    );
  }

  const githubUrl = safeExternalUrl(repo.htmlUrl);
  const homepageUrl = repo.homepage ? safeExternalUrl(repo.homepage) : null;
  const summaryText =
    sanitizeSummaryText(repo.aiSummary || repo.readmeExcerpt || repo.repoSummary) ||
    "README summary is not available yet.";

  return (
    <aside data-testid="repo-detail-panel" className="repo-detail-panel" aria-label="Selected repository">
      <div className="repo-detail-panel__header">
        <div>
          <p className="repo-detail-panel__eyebrow">Selected repository</p>
          <h2 className="repo-detail-panel__title">{repo.fullName}</h2>
        </div>
      </div>

      {githubUrl ? (
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="repo-detail-link">
          {githubUrl}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}

      <p className="repo-detail-panel__description">{repo.description}</p>

      <RepoDetailMetadata repo={repo} />

      <section className="repo-detail-section">
        <h3 className="repo-detail-section__title">Topics</h3>
        <div className="repo-detail-section__chips">
          {repo.topics.map((topic) => (
            <span key={topic} className="repo-chip">
              {topic}
            </span>
          ))}
        </div>
      </section>

      <section className="repo-detail-section">
        <div className="repo-detail-section__header">
          <h3 className="repo-detail-section__title">My note</h3>
          <div className="repo-detail-section__actions">
            {noteSaveFeedback ? (
              <span className="repo-detail-save-status" role="status" aria-live="polite">
                {noteSaveFeedback}
              </span>
            ) : null}
            <button type="button" onClick={onSaveNote} className="workbench-button workbench-button--ghost">
              <Check className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>
        <textarea
          aria-label="My note"
          value={noteDraft}
          onChange={(event) => onNoteChange(event.target.value)}
          className="repo-note-textarea"
        />
        <div className="repo-detail-section__chips">
          {repo.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => void onDeleteTag(tag)}
              disabled={Boolean(tagDeleting)}
              className="repo-chip repo-chip--interactive"
            >
              {tag}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
        <div className="repo-tag-editor">
          <label className="workbench-input-shell">
            <input
              value={newTag}
              onChange={(event) => onNewTagChange(event.target.value)}
              placeholder="New tag"
              className="workbench-input"
            />
            {newTag ? (
              <button
                type="button"
                className="workbench-input-clear"
                aria-label="Clear new tag"
                onClick={() => onNewTagChange("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            onClick={() => void onAddTag()}
            disabled={tagSubmitting}
            className="workbench-button workbench-button--ghost"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="repo-detail-section">
        <div className="repo-detail-section__header">
          <h3 className="repo-detail-section__title">AI summary</h3>
          <span className="repo-detail-hint">
            README {formatDateTime(repo.readmeExcerptUpdatedAt)}
          </span>
        </div>
        <div className="repo-summary-card">
          <Bot className="h-4 w-4 text-[color:var(--accent)]" />
          <CollapsibleText
            text={summaryText}
            limit={360}
            className="repo-summary-card__body"
          />
          <p className="repo-detail-hint">
            Generated from {SOURCE_LABELS[repo.readmeExcerptSource] ?? repo.readmeExcerptSource}
          </p>
        </div>
      </section>

      <section className="repo-detail-section">
        <h3 className="repo-detail-section__title">Actions</h3>
        <div className="repo-actions">
          <button
            type="button"
            onClick={() => void onFavoriteToggle()}
            disabled={favoriteUpdating}
            className="workbench-button workbench-button--ghost"
            aria-label={repo.isFavorite ? "Favorited" : "Favorite"}
          >
            <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
            {repo.isFavorite ? "Favorited" : "Favorite"}
          </button>
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="workbench-button workbench-button--ghost">
              Open on GitHub
            </a>
          ) : null}
          {homepageUrl ? (
            <a href={homepageUrl} target="_blank" rel="noopener noreferrer" className="workbench-button workbench-button--ghost">
              <Globe className="h-4 w-4" />
              Homepage
            </a>
          ) : null}
        </div>
      </section>

      <div className="repo-detail-footer">
        <span>Summary source: {SOURCE_LABELS[repo.repoSummarySource] ?? repo.repoSummarySource}</span>
        <span>Updated {formatDateTime(repo.repoSummaryUpdatedAt)}</span>
      </div>
    </aside>
  );
}
