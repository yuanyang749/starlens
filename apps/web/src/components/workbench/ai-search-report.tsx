// AI 搜索报告展示组件
// 职责：渲染 AI 搜索结果摘要和候选仓库卡片

import { X, Star } from "lucide-react";
import type { AiSearchInsight } from "./workbench-api";

function renderFormattedSummary(text: string) {
  // 分割并格式化段落/列表
  const normalizedText = text.replace(/(\d+\.\s+\*\*)/g, "\n$1");
  const lines = normalizedText.split("\n").map(line => line.trim()).filter(Boolean);

  return (
    <div className="ai-search-report__summary-flow">
      {lines.map((line, idx) => {
        const parts: Array<{ text: string; isBold: boolean }> = [];
        const tempLine = line;

        const boldRegex = /\*\*(.*?)\*\*/g;
        let match;
        let lastIndex = 0;

        while ((match = boldRegex.exec(tempLine)) !== null) {
          const matchIndex = match.index;
          if (matchIndex > lastIndex) {
            parts.push({ text: tempLine.substring(lastIndex, matchIndex), isBold: false });
          }
          parts.push({ text: match[1], isBold: true });
          lastIndex = boldRegex.lastIndex;
        }

        if (lastIndex < tempLine.length) {
          parts.push({ text: tempLine.substring(lastIndex), isBold: false });
        }

        const content = parts.length > 0 ? parts.map((part, pIdx) => {
          if (part.isBold) {
            return <strong key={pIdx} className="ai-search-report__highlight">{part.text}</strong>;
          }
          return <span key={pIdx}>{part.text}</span>;
        }) : line;

        const isListItem = /^\d+\.\s+/.test(line);

        if (isListItem) {
          return (
            <div key={idx} className="ai-search-report__summary-item">
              <span className="ai-search-report__summary-bullet">•</span>
              <div className="ai-search-report__summary-item-content">{content}</div>
            </div>
          );
        }

        const isNote = (line.startsWith("*(") && line.endsWith(")*")) || (line.startsWith("(") && line.endsWith(")"));
        if (isNote) {
          const cleanedNote = line.replace(/^\*\(/, "(").replace(/\)\*$/, ")");
          return (
            <p key={idx} className="ai-search-report__summary-note">
              {cleanedNote}
            </p>
          );
        }

        return (
          <p key={idx} className="ai-search-report__summary-paragraph">
            {content}
          </p>
        );
      })}
    </div>
  );
}

export function AiSearchReport({
  summaryText,
  insights,
  selectedId,
  onSelect,
  onClose,
}: {
  summaryText: string;
  insights: AiSearchInsight[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="ai-search-report" role="status" aria-live="polite">
      <div className="ai-search-report__header">
        <div className="ai-search-report__title-wrap">
          <span className="ai-search-report__icon-spark">✦</span>
          <h3 className="ai-search-report__title">AI 智能检索报告</h3>
        </div>
        <button
          type="button"
          className="ai-search-report__close"
          aria-label="关闭报告"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="ai-search-report__summary">
        {renderFormattedSummary(summaryText)}
      </div>

      <div className="ai-search-report__grid">
        {insights.map((item) => {
          const score = item.score ?? 0;
          let starsCount = 1;
          if (score >= 900) starsCount = 5;
          else if (score >= 700) starsCount = 4;
          else if (score >= 500) starsCount = 3;
          else if (score >= 300) starsCount = 2;

          const isSelected = item.id === selectedId;

          return (
            <div
              key={item.id}
              className={`ai-search-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="ai-search-card__header">
                <span className="ai-search-card__name" title={item.fullName}>
                  {item.fullName}
                </span>
                <div className="ai-search-card__stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`ai-search-card__star ${
                        i < starsCount ? "is-filled" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="ai-search-card__reason">{item.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
