"use client";

import type { RepoSummary } from "@starlens-app/core";
import { Bot, Check, ExternalLink, Globe, Plus, Star, X } from "lucide-react";
import {
  SOURCE_LABELS,
  formatDateTime,
  safeExternalUrl,
  sanitizeSummaryText,
} from "./workbench-formatters";
import { RepoDetailMetadata } from "./repo-detail-metadata";

function ScrollableText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className="repo-summary-card__text-scroll">
      <p className={className}>{text}</p>
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
          <p className="repo-detail-panel__eyebrow">已选仓库</p>
          <p className="repo-detail-panel__empty-title">选择一个仓库</p>
          <p className="repo-detail-panel__empty-copy">
            从列表中选择仓库，查看元数据、备注、标签和摘要。
          </p>
        </div>
      </aside>
    );
  }

  const githubUrl = safeExternalUrl(repo.htmlUrl);
  const homepageUrl = repo.homepage ? safeExternalUrl(repo.homepage) : null;
  const summaryText =
    sanitizeSummaryText(repo.aiSummary || repo.readmeExcerpt || repo.repoSummary) ||
    "README 摘要暂不可用。";

  return (
    <aside data-testid="repo-detail-panel" className="repo-detail-panel" aria-label="已选仓库">
      <div className="repo-detail-panel__header">
        <div>
          <p className="repo-detail-panel__eyebrow">已选仓库</p>
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
        <h3 className="repo-detail-section__title">主题标签</h3>
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
          <h3 className="repo-detail-section__title">我的备注</h3>
          <div className="repo-detail-section__actions">
            {noteSaveFeedback ? (
              <span className="repo-detail-save-status" role="status" aria-live="polite">
                {noteSaveFeedback}
              </span>
            ) : null}
            <button type="button" onClick={onSaveNote} className="workbench-button workbench-button--ghost">
              <Check className="h-4 w-4" />
              保存
            </button>
          </div>
        </div>
        <textarea
          aria-label="我的备注"
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
              placeholder="新标签"
              className="workbench-input"
            />
            {newTag ? (
              <button
                type="button"
                className="workbench-input-clear"
                aria-label="清空新标签"
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
            添加
          </button>
        </div>
      </section>

      <section className="repo-detail-section">
        <div className="repo-detail-section__header">
          <h3 className="repo-detail-section__title">AI 摘要</h3>
          <span className="repo-detail-hint">
            README {formatDateTime(repo.readmeExcerptUpdatedAt)}
          </span>
        </div>
        <div className="repo-summary-card">
          <Bot className="h-4 w-4 text-[color:var(--accent)]" />
          <ScrollableText
            text={summaryText}
            className="repo-summary-card__body"
          />
          <p className="repo-detail-hint">
            来源：{SOURCE_LABELS[repo.readmeExcerptSource] ?? repo.readmeExcerptSource}
          </p>
        </div>
      </section>

      <section className="repo-detail-section">
        <h3 className="repo-detail-section__title">操作</h3>
        <div className="repo-actions">
          <button
            type="button"
            onClick={() => void onFavoriteToggle()}
            disabled={favoriteUpdating}
            className="workbench-button workbench-button--ghost"
            aria-label={repo.isFavorite ? "已重点收藏" : "重点收藏"}
          >
            <Star className={repo.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
            {repo.isFavorite ? "已重点收藏" : "重点收藏"}
          </button>
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="workbench-button workbench-button--ghost">
              <ExternalLink className="h-4 w-4" />
              在 GitHub 打开
            </a>
          ) : null}
          {homepageUrl ? (
            <a href={homepageUrl} target="_blank" rel="noopener noreferrer" className="workbench-button workbench-button--ghost">
              <Globe className="h-4 w-4" />
              项目主页
            </a>
          ) : null}
        </div>
      </section>

      <div className="repo-detail-footer">
        <span>摘要来源：{SOURCE_LABELS[repo.repoSummarySource] ?? repo.repoSummarySource}</span>
        <span aria-hidden="true">·</span>
        <span>更新 {formatDateTime(repo.repoSummaryUpdatedAt)}</span>
      </div>
    </aside>
  );
}
