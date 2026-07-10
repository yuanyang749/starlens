"use client";

// AI 对话视图
// 职责：会话列表 + 消息流 + 输入区，集成 useChatStream 流式 hook

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";
import { fetchApi } from "@/lib/api-client";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { useChatStream, type ChatCandidate, type ChatMessage } from "./use-chat-stream";

// 中文注释：欢迎页示例问题，覆盖不同工具类型（统计/推荐/分析）
const EXAMPLE_QUESTIONS: string[] = [
  "统计我收藏的仓库按语言分布",
  "推荐适合做 CLI 工具的仓库",
  "帮我看看收藏里有没有重复或过时的仓库",
  "我要做一个实时聊天应用，有哪些收藏可以参考",
];

// 中文注释：代码块语言别名映射，prism 部分语言名需要归一化
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

// 会话列表项类型（与后端 GET /api/ai/chat/conversations 返回一致）
type ConversationSummary = {
  id: string;
  title: string;
  lastQuestion: string | null;
  createdAt: string;
  updatedAt: string;
};

// 后端返回的历史消息类型
type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  candidates: ChatCandidate[];
  createdAt: string;
};

export function ChatView() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // 中文注释：重命名相关状态。editingId 标记正在编辑的会话，editTitle 存储输入框值
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 中文注释：标记是否已从本地缓存恢复过会话，避免恢复期间被其他 effect 覆盖
  const restoredRef = useRef(false);

  const { messages, isStreaming, conversationId, error, sendMessage, stop, loadHistory, reset, regenerate } = useChatStream();

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const data = await fetchApi<{ conversations: ConversationSummary[] }>("/api/ai/chat/conversations?limit=50");
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      // 静默失败，不打断用户
      return [];
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    // 中文注释：挂载时先从 localStorage 读上次会话 id，若有效则自动恢复
    (async () => {
      const list = await loadConversations();
      const savedId = typeof window !== "undefined" ? window.localStorage.getItem("starlens:lastChatId") : null;
      if (savedId && list.some((c) => c.id === savedId)) {
        // 上次会话仍存在，自动选中并加载历史
        setActiveConvId(savedId);
        try {
          const data = await fetchApi<{ conversation: ConversationSummary; messages: StoredMessage[] }>(
            `/api/ai/chat/conversations/${savedId}`,
          );
          loadHistory(
            savedId,
            data.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            })),
          );
        } catch {
          // 历史加载失败时静默，保留会话选中状态
        }
      }
      restoredRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 中文注释：conversationId 变化（首次提问后端新建会话）时同步 activeConvId、刷新列表、持久化
  useEffect(() => {
    if (!restoredRef.current) return;
    if (conversationId && conversationId !== activeConvId) {
      setActiveConvId(conversationId);
      loadConversations();
    }
  }, [conversationId, activeConvId, loadConversations]);

  // 中文注释：activeConvId 变化时持久化到 localStorage，切走再回来能恢复
  useEffect(() => {
    if (!restoredRef.current) return;
    if (activeConvId) {
      window.localStorage.setItem("starlens:lastChatId", activeConvId);
    } else {
      window.localStorage.removeItem("starlens:lastChatId");
    }
  }, [activeConvId]);

  // 切换会话：加载历史消息
  const handleSelectConversation = useCallback(
    async (convId: string) => {
      if (convId === activeConvId) return;
      setActiveConvId(convId);
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
          })),
        );
      } catch {
        // 加载失败保持当前状态
      } finally {
        setLoadingHistory(false);
      }
    },
    [activeConvId, loadHistory],
  );

  // 新建对话
  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    reset();
    textareaRef.current?.focus();
  }, [reset]);

  // 删除会话
  const handleDeleteConversation = useCallback(
    async (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetchApi<{ deleted: boolean }>(`/api/ai/chat/conversations/${convId}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (convId === activeConvId) {
          handleNewConversation();
        }
      } catch {
        // 静默
      }
    },
    [activeConvId, handleNewConversation],
  );

  // 开始重命名
  const handleStartRename = useCallback((convId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(convId);
    setEditTitle(currentTitle);
  }, []);

  // 取消重命名
  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
  }, []);

  // 提交重命名
  const handleConfirmRename = useCallback(
    async (convId: string) => {
      const title = editTitle.trim();
      if (!title) return;
      setRenaming(true);
      try {
        await fetchApi(`/api/ai/chat/conversations/${convId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title } : c)));
        setEditingId(null);
        setEditTitle("");
      } catch {
        // 静默
      } finally {
        setRenaming(false);
      }
    },
    [editTitle],
  );

  // 发送：await 流式完成后刷新会话列表（lastQuestion/updatedAt 更新）
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(text);
    loadConversations();
  }, [input, isStreaming, sendMessage, loadConversations]);

  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // textarea 自适应高度
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div className="chat-view">
      {sidebarOpen ? (
        <aside className="chat-view__sidebar">
          <div className="chat-view__sidebar-header">
            <span className="chat-view__sidebar-title">对话列表</span>
            <button
              type="button"
              className="chat-view__icon-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="收起列表"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <button type="button" className="chat-view__new-btn" onClick={handleNewConversation}>
            <Plus className="h-4 w-4" />
            新建对话
          </button>
          <div className="chat-view__conv-list">
            {loadingConversations && conversations.length === 0 ? (
              <div className="chat-view__empty-hint">加载中…</div>
            ) : conversations.length === 0 ? (
              <div className="chat-view__empty-hint">暂无对话，开始提问后会自动保存。</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`chat-view__conv-item ${c.id === activeConvId ? "is-active" : ""}`}
                  onClick={() => handleSelectConversation(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectConversation(c.id);
                    }
                  }}
                >
                  <MessageCircle className="chat-view__conv-icon h-4 w-4 shrink-0" />
                  {editingId === c.id ? (
                    // 中文注释：重命名编辑态，内联输入框 + 确认/取消按钮
                    <div className="chat-view__conv-edit">
                      <input
                        className="chat-view__conv-edit-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleConfirmRename(c.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            handleCancelRename();
                          }
                        }}
                        autoFocus
                        disabled={renaming}
                      />
                      <button
                        type="button"
                        className="chat-view__conv-edit-btn chat-view__conv-edit-btn--ok"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleConfirmRename(c.id);
                        }}
                        disabled={renaming}
                        aria-label="确认重命名"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="chat-view__conv-edit-btn chat-view__conv-edit-btn--cancel"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelRename();
                        }}
                        aria-label="取消重命名"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="chat-view__conv-text">
                        <span className="chat-view__conv-title">{c.title}</span>
                        {c.lastQuestion ? <span className="chat-view__conv-sub">{c.lastQuestion}</span> : null}
                      </span>
                      <span className="chat-view__conv-actions">
                        <span
                          className="chat-view__conv-rename"
                          onClick={(e) => handleStartRename(c.id, c.title, e)}
                          role="button"
                          tabIndex={-1}
                          aria-label="重命名"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </span>
                        <span
                          className="chat-view__conv-delete"
                          onClick={(e) => handleDeleteConversation(c.id, e)}
                          role="button"
                          tabIndex={-1}
                          aria-label="删除对话"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </span>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          className="chat-view__open-sidebar"
          onClick={() => setSidebarOpen(true)}
          aria-label="展开对话列表"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}

      <div className="chat-view__main">
        <div className="chat-view__header">
          <h2 className="chat-view__heading">
            {activeConvId ? conversations.find((c) => c.id === activeConvId)?.title ?? "AI 对话" : "AI 对话"}
          </h2>
          {loadingHistory ? <span className="chat-view__loading-hint">加载历史中…</span> : null}
          {isStreaming ? (
            <button type="button" className="chat-view__stop-btn" onClick={stop}>
              停止生成
            </button>
          ) : null}
        </div>

        {/* 中文注释：autoScroll 让流式输出时自动滚到底部（ResizeObserver 监听内容高度变化），
            defaultScrollPosition="end" 确保加载历史时也滚到最新消息 */}
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller className="chat-view__scroller">
            <MessageScrollerViewport>
              <MessageScrollerContent>
                {messages.length === 0 ? (
                  <div className="chat-view__welcome">
                    <div className="chat-view__welcome-icon">✦</div>
                    <p className="chat-view__welcome-title">向 AI 提问你的 GitHub 收藏仓库</p>
                    <p className="chat-view__welcome-hint">
                      支持多轮对话，AI 会基于你收藏的仓库回答问题、推荐项目。
                    </p>
                    <div className="chat-view__examples">
                      {EXAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="chat-view__example-item"
                          onClick={() => {
                            setInput(q);
                            void sendMessage(q).then(() => loadConversations());
                          }}
                          disabled={isStreaming}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isLast={i === messages.length - 1}
                      isStreaming={isStreaming}
                      onCopy={() => {}}
                      onRegenerate={() => void regenerate()}
                    />
                  ))
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>

        {error ? <div className="chat-view__error">{error}</div> : null}

        <div className="chat-view__input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-view__input"
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            type="button"
            className="chat-view__send-btn"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isStreaming}
            aria-label="发送"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// 代码块组件：语法高亮 + 复制按钮
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板权限被拒绝时静默
    }
  }, [code]);

  return (
    <div className="chat-view__code-block">
      <div className="chat-view__code-header">
        <span className="chat-view__code-lang">{language}</span>
        <button
          type="button"
          className="chat-view__code-copy"
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
          <pre className={`chat-view__code-pre ${className}`} style={style}>
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

// 自定义 ReactMarkdown 的 code 组件渲染
function markdownComponents() {
  return {
    // 中文注释：code 组件区分行内代码和代码块。react-markdown v9 中 code 节点带 className 表示代码块
    code(props: { className?: string; children?: React.ReactNode }) {
      const { className, children } = props;
      const text = String(children ?? "");
      const match = /language-(\w+)/.exec(className ?? "");
      // 中文注释：有 language-xxx 且内容含换行 → 代码块；否则行内代码
      if (match && text.includes("\n")) {
        return <CodeBlock language={resolveLanguage(match[1])} code={text} />;
      }
      // 无 className 但内容含换行（无语言标记的代码块）
      if (!className && text.includes("\n")) {
        return <CodeBlock language="text" code={text} />;
      }
      return <code className="chat-view__inline-code">{children}</code>;
    },
  };
}

// 单条消息气泡
function MessageBubble({
  message,
  isLast,
  isStreaming,
  onCopy,
  onRegenerate,
}: {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy();
    } catch {
      // 静默
    }
  }, [message.content, onCopy]);

  return (
    <MessageScrollerItem>
      <Message align={isUser ? "end" : "start"}>
        {/* 中文注释：用户/AI 头像，用 icon 区分（User 图标 vs Bot 图标） */}
        <MessageAvatar
          className={
            isUser
              ? "chat-view__avatar chat-view__avatar--user"
              : "chat-view__avatar chat-view__avatar--ai"
          }
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </MessageAvatar>
        <MessageContent>
          {/* 流式状态提示（正在搜索…/正在生成…） */}
          {!isUser && message.statusText ? (
            <Marker variant="default">
              <MarkerIcon>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </MarkerIcon>
              <MarkerContent>{message.statusText}</MarkerContent>
            </Marker>
          ) : null}

          {/* 中文注释：包裹 bubble + 操作栏，hover 时显示操作栏 */}
          <div className="chat-view__msg-body">
            {/* 消息正文 */}
            {message.content ? (
              <Bubble variant={isUser ? "default" : "secondary"} align={isUser ? "end" : "start"}>
                <BubbleContent>
                  {isUser ? (
                    message.content
                  ) : (
                    <div className="chat-view__markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </BubbleContent>
              </Bubble>
            ) : null}

            {/* 消息操作栏：复制（assistant）/ 重新生成（assistant 最后一条且非流式中） */}
            {!isUser && message.content && !message.isStreaming ? (
              <div className="chat-view__msg-actions">
                <button
                  type="button"
                  className="chat-view__msg-action-btn"
                  onClick={handleCopy}
                  aria-label="复制消息"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "已复制" : "复制"}
                </button>
                {isLast && !isStreaming ? (
                  <button
                    type="button"
                    className="chat-view__msg-action-btn"
                    onClick={onRegenerate}
                    aria-label="重新生成"
                  >
                    <RefreshCw className="h-3 w-3" />
                    重新生成
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}
