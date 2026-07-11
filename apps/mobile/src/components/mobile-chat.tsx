"use client";

// 移动端 AI 对话组件
// 职责：会话列表 + 消息页（全屏覆盖）+ 流式输入
// 布局：两级推入式导航（微信风格），消息页覆盖 tabbar

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  Copy,
  Database,
  Download,
  Loader2,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Stethoscope,
  Terminal,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";
import { fetchApi, useChatStream, type ChatCandidate, type ChatMessage } from "@starlens/workbench";

// ───────────────────────── 类型定义 ─────────────────────────

type ConversationSummary = {
  id: string;
  title: string;
  lastQuestion: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  candidates: ChatCandidate[];
  createdAt: string;
};

type MobileChatProps = {
  userName: string;
  userAvatarUrl?: string | null;
  onNavigateToRepo?: (repoId: string) => void;
};

// ───────────────────────── 常量配置 ─────────────────────────

// 中文注释：欢迎页示例问题，2x2 网格布局适配窄屏
const EXAMPLE_QUESTIONS = [
  {
    title: "语言分布",
    desc: "统计收藏仓库的语言分布",
    question: "统计我收藏的仓库按语言分布",
    icon: PieChart,
  },
  {
    title: "CLI 工具",
    desc: "推荐 CLI 开发相关仓库",
    question: "推荐适合做 CLI 工具的仓库",
    icon: Terminal,
  },
  {
    title: "诊断建议",
    desc: "扫描重复或过时仓库",
    question: "帮我看看收藏里有没有重复或过时的仓库",
    icon: Stethoscope,
  },
  {
    title: "项目参考",
    desc: "寻找实时聊天应用参考",
    question: "我要做一个实时聊天应用，有哪些收藏可以参考",
    icon: MessageCircle,
  },
];

// 代码块语言别名
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
};

function resolveLanguage(lang: string | undefined): string {
  if (!lang) return "text";
  const lower = lang.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

// 工具的显示名称和图标
const TOOL_CONFIG: Record<string, { label: string; icon: typeof Search }> = {
  search_repos: { label: "检索仓库列表", icon: Search },
  run_readonly_query: { label: "执行数据库查询", icon: Database },
  get_repo_detail: { label: "读取仓库详情", icon: Terminal },
  get_repo_stats: { label: "分析收藏统计", icon: PieChart },
  recommend_for_task: { label: "匹配开发任务", icon: Sparkles },
  find_related: { label: "寻找关联项目", icon: Search },
  suggest_organization: { label: "扫描整理建议", icon: Wrench },
  add_tag: { label: "添加分类标签", icon: Terminal },
  remove_tag: { label: "移除分类标签", icon: Terminal },
  update_note: { label: "修改仓库备注", icon: Pencil },
  toggle_favorite: { label: "星标常用仓库", icon: Sparkles },
  unstar_repo: { label: "取消 GitHub 星标", icon: X },
  submit_answer: { label: "输出最终解答", icon: Check },
};

function formatToolArgs(argsStr: string): string {
  try {
    const parsed = JSON.parse(argsStr);
    if (!parsed || typeof parsed !== "object") return argsStr;
    if (parsed.sql) {
      const sqlClean = parsed.sql.replace(/\s+/g, " ").trim();
      return sqlClean.length > 50 ? `${sqlClean.slice(0, 50)}...` : sqlClean;
    }
    const priorityKeys = ["query", "q", "keyword", "org", "fullName", "name"];
    for (const key of priorityKeys) {
      if (parsed[key] !== undefined) return `${key}: "${parsed[key]}"`;
    }
    const parts = Object.entries(parsed)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
    return parts.length > 55 ? `${parts.slice(0, 55)}...` : parts;
  } catch {
    return argsStr;
  }
}

// 格式化相对时间
function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  if (hour < 24) return `${hour} 小时前`;
  if (day < 7) return `${day} 天前`;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

// ───────────────────────── 主组件 ─────────────────────────

export function MobileChat({ userName, userAvatarUrl, onNavigateToRepo }: MobileChatProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  // 中文注释：消息页是否打开（选中会话或新建对话时为 true）
  const [messagePageOpen, setMessagePageOpen] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [chatInput, setChatInput] = useState("");
  // 中文注释：会话列表项 ⋯ 菜单
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // 中文注释：重命名相关
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // 中文注释：删除确认
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // 中文注释：消息页 ⋯ 菜单
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  const {
    messages,
    isStreaming,
    conversationId,
    error,
    connectionError,
    sendMessage,
    stop,
    loadHistory,
    reset,
    regenerate,
    retry,
  } = useChatStream();

  // ───────────────────────── 会话列表加载 ─────────────────────────

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const data = await fetchApi<{ conversations: ConversationSummary[] }>(
        "/api/ai/chat/conversations?limit=50",
      );
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      return [];
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // 挂载时加载会话列表
  useEffect(() => {
    void loadConversations();
    restoredRef.current = true;
  }, [loadConversations]);

  // conversationId 变化（首次提问后端新建会话）时同步
  useEffect(() => {
    if (!restoredRef.current) return;
    if (conversationId && conversationId !== activeConvId) {
      setActiveConvId(conversationId);
      void loadConversations();
    }
  }, [conversationId, activeConvId, loadConversations]);

  // ───────────────────────── 会话操作 ─────────────────────────

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      setActiveConvId(convId);
      setMessagePageOpen(true);
      setMenuOpenId(null);
      setLoadingHistory(true);
      try {
        const data = await fetchApi<{ conversation: ConversationSummary; messages: StoredMessage[] }>(
          `/api/ai/chat/conversations/${convId}`,
        );
        loadHistory(
          convId,
          data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            candidates: m.candidates,
            createdAt: m.createdAt,
          })),
        );
      } catch {
        // 加载失败保持当前状态
      } finally {
        setLoadingHistory(false);
      }
    },
    [loadHistory],
  );

  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    reset();
    setMessagePageOpen(true);
    setMenuOpenId(null);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [reset]);

  const handleCloseMessagePage = useCallback(() => {
    setMessagePageOpen(false);
    setActiveConvId(null);
    void loadConversations();
  }, [loadConversations]);

  const handleRename = useCallback(async (convId: string) => {
    const title = renameValue.trim();
    if (!title) return;
    try {
      await fetchApi(`/api/ai/chat/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title } : c)));
    } catch {
      // 静默
    } finally {
      setRenamingId(null);
      setRenameValue("");
    }
  }, []);

  const handleDelete = useCallback(
    async (convId: string) => {
      try {
        await fetchApi(`/api/ai/chat/conversations/${convId}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (convId === activeConvId) {
          handleCloseMessagePage();
        }
      } catch {
        // 静默
      } finally {
        setDeleteConfirmId(null);
      }
    },
    [activeConvId, handleCloseMessagePage],
  );

  // ───────────────────────── 消息发送 ─────────────────────────

  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isStreaming) return;
    setChatInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(text);
    void loadConversations();
  }, [chatInput, isStreaming, sendMessage, loadConversations]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 中文注释：移动端 Enter 换行，不做发送（避免虚拟键盘误触），用发送按钮提交
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // 中文注释：流式输出时自动滚到底部
  useEffect(() => {
    if (!messagePageOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, messagePageOpen]);

  // ───────────────────────── 导出 ─────────────────────────

  const handleExport = useCallback(() => {
    if (messages.length === 0) return;
    const title = activeConvId
      ? conversations.find((c) => c.id === activeConvId)?.title ?? "AI 对话"
      : "AI 对话";
    const lines: string[] = [`# ${title}\n`];
    for (const m of messages) {
      const role = m.role === "user" ? "**用户**" : "**AI**";
      lines.push(`### ${role}\n`);
      lines.push(m.content);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setHeaderMenuOpen(false);
  }, [messages, activeConvId, conversations]);

  // ───────────────────────── 渲染 ─────────────────────────

  const activeConvTitle = activeConvId
    ? conversations.find((c) => c.id === activeConvId)?.title ?? "AI 对话"
    : "新对话";

  return (
    <>
      {/* 会话列表视图 */}
      <section className="mobile-chat-list" aria-label="AI 对话列表">
        <div className="mobile-chat-list-header">
          <strong>AI 对话</strong>
          <button type="button" className="mobile-button mobile-button--primary mobile-chat-new-btn" onClick={handleNewConversation}>
            <Plus className="h-4 w-4" />
            新建
          </button>
        </div>

        {loadingConversations && conversations.length === 0 ? (
          <div className="mobile-chat-empty">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>加载中…</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="mobile-chat-empty">
            <Sparkles className="h-6 w-6" />
            <strong>暂无对话</strong>
            <p>点击「新建」开始与 AI 对话，基于你的 GitHub 收藏回答问题。</p>
          </div>
        ) : (
          <div className="mobile-chat-conv-list">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`mobile-chat-conv-item ${c.id === activeConvId ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  className="mobile-chat-conv-body"
                  onClick={() => void handleSelectConversation(c.id)}
                >
                  <span className="mobile-chat-conv-icon-box">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </span>
                  <span className="mobile-chat-conv-text">
                    <span className="mobile-chat-conv-title">{c.title}</span>
                    {c.lastQuestion ? (
                      <span className="mobile-chat-conv-sub">{c.lastQuestion}</span>
                    ) : null}
                    <span className="mobile-chat-conv-time">{formatRelativeTime(c.updatedAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="mobile-chat-conv-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === c.id ? null : c.id);
                  }}
                  aria-label="更多操作"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpenId === c.id ? (
                  <>
                    {/* 中文注释：点击外部关闭菜单 */}
                    <div className="mobile-chat-menu-backdrop" onClick={() => setMenuOpenId(null)} />
                    <div className="mobile-chat-menu">
                      <button
                        type="button"
                        className="mobile-chat-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(c.id);
                          setRenameValue(c.title);
                          setMenuOpenId(null);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        重命名
                      </button>
                      <button
                        type="button"
                        className="mobile-chat-menu-item mobile-chat-menu-item--danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(c.id);
                          setMenuOpenId(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 重命名弹窗（抽屉化） */}
      <div className={`mobile-drawer-backdrop ${renamingId ? "is-open" : ""}`} onClick={() => setRenamingId(null)}>
        <div className={`mobile-drawer ${renamingId ? "is-open" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="mobile-drawer-handle" />
          <strong className="mobile-drawer-title">重命名对话</strong>
          <input
            className="mobile-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renamingId) void handleRename(renamingId);
              if (e.key === "Escape") setRenamingId(null);
            }}
            placeholder="请输入新对话名称"
          />
          <div className="mobile-drawer-actions">
            <button type="button" className="mobile-button" onClick={() => setRenamingId(null)}>
              取消
            </button>
            <button
              type="button"
              className="mobile-button mobile-button--primary"
              onClick={() => renamingId && void handleRename(renamingId)}
            >
              <Check className="h-4 w-4" />
              确认
            </button>
          </div>
        </div>
      </div>

      {/* 删除确认弹窗（抽屉化） */}
      <div className={`mobile-drawer-backdrop ${deleteConfirmId ? "is-open" : ""}`} onClick={() => setDeleteConfirmId(null)}>
        <div className={`mobile-drawer ${deleteConfirmId ? "is-open" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="mobile-drawer-handle" />
          <strong className="mobile-drawer-title">确认删除该对话？</strong>
          <p className="mobile-drawer-hint">删除后无法恢复，该对话的所有消息将永久丢失。</p>
          <div className="mobile-drawer-actions">
            <button type="button" className="mobile-button" onClick={() => setDeleteConfirmId(null)}>
              取消
            </button>
            <button
              type="button"
              className="mobile-button mobile-button--danger"
              onClick={() => deleteConfirmId && void handleDelete(deleteConfirmId)}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        </div>
      </div>

      {/* 消息页（全屏覆盖，隐藏 tabbar，支持滑入滑出转场） */}
      <aside 
        className={`mobile-chat-message ${messagePageOpen ? "is-open" : ""}`} 
        aria-label="AI 对话消息"
      >
          {/* Header */}
          <div className="mobile-chat-message-header">
            <button
              type="button"
              className="mobile-icon-button"
              onClick={handleCloseMessagePage}
              aria-label="返回对话列表"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <strong className="mobile-chat-message-title">{activeConvTitle}</strong>
            <button
              type="button"
              className="mobile-icon-button"
              onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
              aria-label="更多操作"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {headerMenuOpen ? (
              <>
                <div className="mobile-chat-menu-backdrop" onClick={() => setHeaderMenuOpen(false)} />
                <div className="mobile-chat-menu mobile-chat-menu--header">
                  {activeConvId ? (
                    <button
                      type="button"
                      className="mobile-chat-menu-item"
                      onClick={() => {
                        setRenamingId(activeConvId);
                        setRenameValue(activeConvTitle);
                        setHeaderMenuOpen(false);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      重命名
                    </button>
                  ) : null}
                  {messages.length > 0 ? (
                    <button
                      type="button"
                      className="mobile-chat-menu-item"
                      onClick={handleExport}
                    >
                      <Download className="h-3.5 w-3.5" />
                      导出 Markdown
                    </button>
                  ) : null}
                  {activeConvId ? (
                    <button
                      type="button"
                      className="mobile-chat-menu-item mobile-chat-menu-item--danger"
                      onClick={() => {
                        setDeleteConfirmId(activeConvId);
                        setHeaderMenuOpen(false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除对话
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {loadingHistory ? (
            <div className="mobile-chat-message-loading">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>加载历史消息…</span>
            </div>
          ) : null}

          {/* 消息流 */}
          <div className="mobile-chat-message-body" ref={scrollRef}>
            {messages.length === 0 && !loadingHistory ? (
              <div className="mobile-chat-welcome">
                <div className="mobile-chat-welcome-icon">
                  <Sparkles className="h-7 w-7" />
                </div>
                <p className="mobile-chat-welcome-title">向 AI 提问你的 GitHub 收藏</p>
                <p className="mobile-chat-welcome-hint">
                  支持多轮对话，AI 会基于你收藏的仓库回答问题、推荐项目。
                </p>
                <div className="mobile-chat-examples">
                  {EXAMPLE_QUESTIONS.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={i}
                        type="button"
                        className="mobile-chat-example"
                        onClick={() => {
                          setChatInput(item.question);
                          void sendMessage(item.question).then(() => loadConversations());
                        }}
                        disabled={isStreaming}
                      >
                        <div className="mobile-chat-example-icon">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="mobile-chat-example-title">{item.title}</span>
                        <span className="mobile-chat-example-desc">{item.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isLast={i === messages.length - 1}
                  isStreaming={isStreaming}
                  userAvatarUrl={userAvatarUrl}
                  userName={userName}
                  onRegenerate={() => void regenerate()}
                  onNavigateToRepo={onNavigateToRepo}
                />
              ))
            )}
          </div>

          {/* 错误提示 */}
          {error ? (
            <div className="mobile-chat-error">
              <span>{error}</span>
              {connectionError && !isStreaming ? (
                <button type="button" className="mobile-chat-retry" onClick={() => void retry()}>
                  <RefreshCw className="h-3 w-3" />
                  重试
                </button>
              ) : null}
            </div>
          ) : null}

          {/* 输入区（固定在键盘上方） */}
          <div className="mobile-chat-input-bar">
            <textarea
              ref={textareaRef}
              className="mobile-chat-input"
              placeholder="输入问题…"
              value={chatInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            {isStreaming ? (
              <button
                type="button"
                className="mobile-chat-send mobile-chat-send--stop"
                onClick={stop}
                aria-label="停止生成"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                className="mobile-chat-send"
                onClick={() => void handleSend()}
                disabled={!chatInput.trim()}
                aria-label="发送"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </aside>
    </>
  );
}

// ───────────────────────── 消息气泡组件 ─────────────────────────

function MessageBubble({
  message,
  isLast,
  isStreaming,
  userAvatarUrl,
  userName,
  onRegenerate,
  onNavigateToRepo,
}: {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  userAvatarUrl?: string | null;
  userName: string;
  onRegenerate: () => void;
  onNavigateToRepo?: (repoId: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 静默
    }
  }, [message.content]);

  const toolCount = message.toolCalls?.length ?? 0;

  return (
    <div className={`mobile-chat-bubble-wrap ${isUser ? "is-user" : "is-ai"}`}>
      {/* 头像 */}
      <div className={`mobile-chat-avatar ${isUser ? "is-user" : "is-ai"}`}>
        {isUser ? (
          userAvatarUrl && !avatarFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userAvatarUrl}
              alt={userName}
              className="w-full h-full object-cover rounded-full"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <User className="h-4 w-4" />
          )
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      <div className="mobile-chat-bubble-content">
        {/* 流式状态提示 */}
        {!isUser && message.statusText && toolCount === 0 ? (
          <div className="mobile-chat-status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{message.statusText}</span>
          </div>
        ) : null}

        {/* 工具调用：竖向折叠卡 */}
        {!isUser && toolCount > 0 ? (
          <button
            type="button"
            className="mobile-chat-tools"
            onClick={() => setToolsExpanded(!toolsExpanded)}
          >
            <div className="mobile-chat-tools-header">
              <Terminal className="h-3.5 w-3.5" />
              <span>{message.isStreaming ? "执行链" : "已执行"}（{toolCount}）</span>
              <span className="mobile-chat-tools-toggle">
                {toolsExpanded ? "收起" : "展开"}
              </span>
            </div>
            {toolsExpanded ? (
              <div className="mobile-chat-tools-list">
                {message.toolCalls!.map((tc, i) => {
                  const config = TOOL_CONFIG[tc.name] ?? { label: tc.name, icon: Wrench };
                  const isActive = i === toolCount - 1 && message.isStreaming && tc.name !== "submit_answer";
                  const Icon = isActive ? Loader2 : config.icon;
                  return (
                    <div key={i} className="mobile-chat-tools-item">
                      <div className={`mobile-chat-tools-badge ${isActive ? "is-active" : ""}`}>
                        <Icon className={`h-3 w-3 ${isActive ? "animate-spin" : ""}`} />
                      </div>
                      {i < toolCount - 1 ? <div className="mobile-chat-tools-connector" /> : null}
                      <div className="mobile-chat-tools-text">
                        <span className="mobile-chat-tools-label">
                          {config.label}{isActive ? "…" : ""}
                        </span>
                        {tc.args ? (
                          <code className="mobile-chat-tools-args">{formatToolArgs(tc.args)}</code>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </button>
        ) : null}

        {/* 消息正文 */}
        {message.content ? (
          <div className={`mobile-chat-bubble ${isUser ? "is-user" : "is-ai"}`}>
            {isUser ? (
              message.content
            ) : (
              <div className="mobile-chat-markdown">
                 <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents(onNavigateToRepo)}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ) : null}


        {/* 操作栏 */}
        {message.content && !message.isStreaming ? (
          <div className="mobile-chat-bubble-actions">
            <button
              type="button"
              className="mobile-chat-action-btn"
              onClick={handleCopy}
              aria-label={copied ? "已复制" : "复制"}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
            {!isUser && isLast && !isStreaming ? (
              <button
                type="button"
                className="mobile-chat-action-btn"
                onClick={onRegenerate}
                aria-label="重新生成"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────────────── 候选仓库卡片 ─────────────────────────



// ───────────────────────── Markdown 组件 ─────────────────────────

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function markdownComponents(onNavigate?: (fullName: string) => void) {
  return {
    code(props: { className?: string; children?: React.ReactNode }) {
      const { className, children } = props;
      const text = String(children ?? "");
      const match = /language-(\w+)/.exec(className ?? "");
      if (match && text.includes("\n")) {
        return <CodeBlock language={resolveLanguage(match[1])} code={text} />;
      }
      if (!className && text.includes("\n")) {
        return <CodeBlock language="text" code={text} />;
      }
      if (onNavigate && !className && REPO_PATTERN.test(text.trim())) {
        return (
          <button
            type="button"
            className="mobile-chat-repo-link"
            onClick={() => onNavigate(text.trim())}
            title={`查看 ${text.trim()} 详情`}
          >
            {text}
          </button>
        );
      }
      return <code className="mobile-chat-inline-code">{children}</code>;
    },
  };
}

// ───────────────────────── 代码块组件 ─────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 静默
    }
  }, [code]);

  return (
    <div className="mobile-chat-code-block">
      <div className="mobile-chat-code-header">
        <span className="mobile-chat-code-lang">{language}</span>
        <button
          type="button"
          className="mobile-chat-code-copy"
          onClick={handleCopy}
          aria-label="复制代码"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              复制
            </>
          )}
        </button>
      </div>
      <Highlight theme={themes.nightOwl} code={code.trim()} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`mobile-chat-code-pre ${className}`} style={style}>
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
