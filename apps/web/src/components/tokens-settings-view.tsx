"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "@starlens-app/core";
import { Copy, FileText, KeyRound, Plus, ShieldCheck, TerminalSquare } from "lucide-react";
import { ApiClientError, fetchApi } from "@/lib/api-client";

type CreatedToken = TokenRecord & { token?: string };

function maskToken(token: Pick<TokenRecord, "tokenPrefix" | "tokenSuffix">, rawToken?: string) {
  if (rawToken) {
    return `${rawToken.slice(0, 10)}********${rawToken.slice(-6)}`;
  }

  return `${token.tokenPrefix}********${token.tokenSuffix || "******"}`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function currentApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return window.location.origin;
}

function buildCliSetupSnippet(rawToken: string) {
  return [
    "npm install -g @starlens-app/cli",
    "stars setup",
    "stars -v",
  ].join("\n");
}

function buildAgentSkillSnippet(rawToken: string) {
  return [
    "STARLENS_SKILL_FILE=/path/to/starlens/agent-skills/starlens/SKILL.md",
    `STARLENS_TOKEN=${shellQuote(rawToken)}`,
    `STARLENS_API_BASE_URL=${shellQuote(currentApiBaseUrl())}`,
    "",
    "# Hermes/OpenClaw:",
    "# Load $STARLENS_SKILL_FILE as the agent instruction/skill file.",
    "# Keep STARLENS_TOKEN in the runtime secret store or environment.",
    "",
    'curl "$STARLENS_API_BASE_URL/api/search?q=react&pageSize=10" \\',
    '  -H "Authorization: Bearer $STARLENS_TOKEN"',
  ].join("\n");
}

function buildMcpConfigSnippet(rawToken: string) {
  return JSON.stringify(
    {
      mcpServers: {
        starlens: {
          command: "corepack",
          args: ["pnpm", "mcp:start"],
          cwd: "/path/to/starlens",
          env: {
            STARLENS_TOKEN: rawToken,
            STARLENS_API_BASE_URL: currentApiBaseUrl(),
          },
        },
      },
    },
    null,
    2,
  );
}

function maskSnippet(snippet: string, rawToken: string, maskedToken: string) {
  return snippet.replaceAll(rawToken, maskedToken);
}

export function TokensSettingsView() {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copyableTokens, setCopyableTokens] = useState<Record<string, string>>({});
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cli" | "agent" | "mcp">("cli");
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const canCreateToken = noteDraft.trim().length > 0;

  const loadTokens = async (signal?: AbortSignal) => {
    try {
      const data = await fetchApi<TokenRecord[]>("/api/tokens", { signal });
      setError(null);
      setTokens(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiClientError ? err.message : "API Token 加载失败。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadTokens(controller.signal));
    return () => controller.abort();
  }, []);

  const createToken = async () => {
    if (!canCreateToken) {
      setError("请填写 Token 用途备注。");
      return;
    }

    const name = `Token ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    try {
      const token = await fetchApi<CreatedToken>("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, note: noteDraft.trim() }),
      });
      if (token.token) {
        setCopyableTokens((current) => ({ ...current, [token.id]: token.token! }));
        setSelectedTokenId(token.id);
      }
      setNoteDraft("");
      await loadTokens();
      setToast("Token 创建成功。");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Token 创建失败。");
    }
  };

  const revokeToken = async (id: string) => {
    try {
      await fetchApi<{ revoked: true }>(`/api/tokens/${id}`, { method: "DELETE" });
      setCopyableTokens((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await loadTokens();
      setToast("Token 已撤销。");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Token 撤销失败。");
    }
  };

  const copyToken = async (id: string) => {
    const token = copyableTokens[id];
    if (!token) return;

    try {
      await navigator.clipboard.writeText(token);
      setCopiedTokenId(id);
      setToast("Token 已复制。");
    } catch {
      setError("Token 复制失败。");
    }
  };

  const copySnippet = async (id: string, kind: "cli" | "agent" | "mcp", snippet: string) => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedSnippetId(`${id}:${kind}`);
      setToast(
        kind === "cli"
          ? "CLI 配置已复制。"
          : kind === "agent"
            ? "Agent Skill 配置已复制。"
            : "MCP 配置已复制。",
      );
    } catch {
      setError("配置片段复制失败。");
    }
  };

  const activeTokenId = selectedTokenId || tokens[0]?.id || "default";
  const activeToken = tokens.find((t) => t.id === activeTokenId);
  const rawToken = activeToken ? copyableTokens[activeToken.id] : undefined;
  const maskedToken = activeToken ? maskToken(activeToken, rawToken) : "stl_xxx";
  const tokenValue = rawToken || "stl_xxx";

  const cliSnippet = buildCliSetupSnippet(tokenValue);
  const agentSnippet = buildAgentSkillSnippet(tokenValue);
  const mcpSnippet = buildMcpConfigSnippet(tokenValue);
  const activeSnippet = activeTab === "cli" ? cliSnippet : activeTab === "agent" ? agentSnippet : mcpSnippet;

  const displaySnippet = rawToken
    ? maskSnippet(activeSnippet, rawToken, maskedToken)
    : activeSnippet.replaceAll("stl_xxx", maskedToken);

  return (
    <section className="app-panel rounded-[24px] p-5">
      <div className="mb-5 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
        <KeyRound className="h-4 w-4 text-[color:var(--accent)]" />
        可用 API Token
      </div>

      <label className="mb-4 block cursor-pointer">
        <span className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
          用途备注 <span className="text-red-500">*</span>
        </span>
        <input
          value={noteDraft}
          onChange={(event) => {
            setNoteDraft(event.target.value);
            if (error === "请填写 Token 用途备注。") setError(null);
          }}
          placeholder="Token 用途备注"
          required
          className="h-11 w-full rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
        />
      </label>

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={createToken}
          disabled={!canCreateToken}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
        >
          <Plus className="h-4 w-4" />新建 Token
        </button>
      </div>

      {toast ? <p className="mb-3 text-sm text-emerald-500">{toast}</p> : null}
      {error ? <div className="mb-3 rounded border border-red-400 p-3 text-sm text-red-500">{error} <button onClick={() => { setLoading(true); loadTokens(); }} className="underline cursor-pointer">重试</button></div> : null}

      {loading ? (
        <div className="space-y-3" data-testid="tokens-skeleton">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded bg-[color:var(--surface-2)]" />)}</div>
      ) : tokens.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[color:var(--line)] p-4 text-sm text-[color:var(--muted)]">暂无 API Token。</p>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => {
            const currentRawToken = copyableTokens[token.id];
            const currentMaskedToken = maskToken(token, currentRawToken);

            return (
              <article key={token.id} className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{token.name}</h2>
                    {token.note ? <p className="mt-1 text-sm text-[color:var(--foreground)]">{token.note}</p> : null}
                    <p className="mt-1 font-mono text-sm text-[color:var(--muted)]">{currentMaskedToken}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {currentRawToken ? (
                      <button
                        type="button"
                        onClick={() => void copyToken(token.id)}
                        className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] underline cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedTokenId === token.id ? "已复制" : "复制"}
                      </button>
                    ) : null}
                    <button onClick={() => revokeToken(token.id)} className="text-sm text-red-500 underline cursor-pointer">撤销</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── 使用指南 & 配置代码 ── */}
      <div className="mt-6 border-t border-[color:var(--line)] pt-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--foreground)]">使用指南 & 配置代码</h3>
            <a
              href="/docs/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--accent)] hover:underline inline-flex items-center cursor-pointer font-medium"
            >
              (查看详细文档)
            </a>
          </div>
          {tokens.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[color:var(--muted)]">选择 Token：</span>
              <select
                value={selectedTokenId || tokens[0]?.id || ""}
                onChange={(e) => setSelectedTokenId(e.target.value)}
                className="h-8 rounded-full border border-[color:var(--line)] bg-white px-3 text-xs outline-none cursor-pointer"
              >
                {tokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.note ? `${t.name} (${t.note})` : t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex gap-1 rounded-full bg-[color:var(--surface-2)] p-1">
            {(["cli", "agent", "mcp"] as const).map((tab) => {
              const labels = { cli: "CLI", agent: "Agent Skill", mcp: "Cursor MCP" };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "bg-[color:var(--foreground)] text-white shadow-sm"
                      : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void copySnippet(activeTokenId, activeTab, activeSnippet)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--line)] cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedSnippetId === `${activeTokenId}:${activeTab}` ? "已复制" : "复制"}
          </button>
        </div>

        <div className="relative rounded-[14px] bg-[#0f1117] overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-[#c9d1d9] scrollbar-thin">
            <code>{displaySnippet}</code>
          </pre>
        </div>

        {activeToken && !rawToken && (
          <p className="mt-2 text-xs text-amber-500">
            提示：当前显示为脱敏 Token。复制并配置时，请将代码中的 <code>{maskedToken}</code> 替换为您保存的真实 Token。
          </p>
        )}
      </div>
    </section>
  );
}
