"use client";

// AI 搜索报告展示组件
// 职责：渲染 AI 搜索结果摘要和候选仓库卡片

import { ChevronDown, ChevronUp, X, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AiSearchInsight } from "./workbench-api";

// 中文注释：摘要列表条数不受控（取决于 AI 回答里写了几条），条数一多就把下方仓库表格挤得很小，
// 所以默认折叠，只有真的超出这个高度才显示"展开"按钮。

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
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  // 中文注释：summaryText 变化时（新一轮 AI 搜索）重置折叠态——父组件在发起新搜索时会先把
  // aiSearchInsights 清空导致本组件整体卸载重挂载，所以这里其实拿到的都是全新的组件实例，
  // 用 key 而不是 effect 里的 setState 来复位更符合 React 的推荐写法。
  const [measuredFor, setMeasuredFor] = useState<string | null>(null);

  useEffect(() => {
    // 折叠状态下量一次真实内容高度 vs 折叠高度，只有真的溢出才需要展开按钮——
    // 避免摘要本来就很短时也白白显示一个没用的"展开"按钮。
    if (measuredFor === summaryText) return;
    const el = summaryRef.current;
    setOverflowing(el ? el.scrollHeight > el.clientHeight + 1 : false);
    setMeasuredFor(summaryText);
  }, [summaryText, measuredFor]);

  return (
    <div className="ai-search-report" role="status" aria-live="polite">
      <div className="ai-search-report__header">
        <div className="ai-search-report__title-wrap">
          <span className="ai-search-report__icon-spark">✦</span>
          <h3 className="ai-search-report__title">AI 智能检索报告</h3>
        </div>
        <div className="ai-search-report__header-actions">
          {overflowing ? (
            <button
              type="button"
              className="ai-search-report__toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "收起" : "展开全部"}
            </button>
          ) : null}
          <button
            type="button"
            className="ai-search-report__close"
            aria-label="关闭报告"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="ai-search-report__summary-wrap">
        <div
          ref={summaryRef}
          className={expanded ? "ai-search-report__summary is-expanded" : "ai-search-report__summary"}
        >
          {renderFormattedSummary(summaryText)}
        </div>
        {!expanded && overflowing ? <div className="ai-search-report__summary-fade" aria-hidden="true" /> : null}
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
