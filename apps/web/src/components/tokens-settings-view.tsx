"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "@starlens/core";
import { Copy, KeyRound, Plus, ShieldCheck, TerminalSquare } from "lucide-react";
import { ApiClientError, fetchApi } from "@/lib/api-client";

type CreatedToken = TokenRecord & { token?: string };

function maskToken(token: Pick<TokenRecord, "tokenPrefix" | "tokenSuffix">, rawToken?: string) {
  if (rawToken) {
    return `${rawToken.slice(0, 10)}********${rawToken.slice(-6)}`;
  }

  return `${token.tokenPrefix}********${token.tokenSuffix || "******"}`;
}

export function TokensSettingsView() {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copyableTokens, setCopyableTokens] = useState<Record<string, string>>({});
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const canCreateToken = noteDraft.trim().length > 0;

  const loadTokens = async (signal?: AbortSignal) => {
    try {
      const data = await fetchApi<TokenRecord[]>("/api/tokens", { signal });
      setError(null);
      setTokens(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiClientError ? err.message : "Failed to load tokens.");
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
      setError("Remark is required.");
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
      }
      setNoteDraft("");
      await loadTokens();
      setToast("Token created successfully.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create token.");
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
      setToast("Token revoked.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to revoke token.");
    }
  };

  const copyToken = async (id: string) => {
    const token = copyableTokens[id];
    if (!token) return;

    try {
      await navigator.clipboard.writeText(token);
      setCopiedTokenId(id);
      setToast("Token copied.");
    } catch {
      setError("Failed to copy token.");
    }
  };

  return (
    <section className="app-panel rounded-[24px] p-5">
      <div className="mb-5 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
        <KeyRound className="h-4 w-4 text-[color:var(--accent)]" />
        Active tokens
      </div>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
          Remark <span className="text-red-500">*</span>
        </span>
        <input
          value={noteDraft}
          onChange={(event) => {
            setNoteDraft(event.target.value);
            if (error === "Remark is required.") setError(null);
          }}
          placeholder="Remark for this token"
          required
          className="h-11 w-full rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
        />
      </label>

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={createToken}
          disabled={!canCreateToken}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus className="h-4 w-4" />New token
        </button>
      </div>

      {toast ? <p className="mb-3 text-sm text-emerald-500">{toast}</p> : null}
      {error ? <div className="mb-3 rounded border border-red-400 p-3 text-sm text-red-500">{error} <button onClick={() => { setLoading(true); loadTokens(); }} className="underline">Retry</button></div> : null}

      {loading ? (
        <div className="space-y-3" data-testid="tokens-skeleton">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded bg-[color:var(--surface-2)]" />)}</div>
      ) : tokens.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[color:var(--line)] p-4 text-sm text-[color:var(--muted)]">No tokens yet.</p>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => {
            const rawToken = copyableTokens[token.id];

            return (
              <article key={token.id} className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{token.name}</h2>
                    {token.note ? <p className="mt-1 text-sm text-[color:var(--foreground)]">{token.note}</p> : null}
                    <p className="mt-1 font-mono text-sm text-[color:var(--muted)]">{maskToken(token, rawToken)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {rawToken ? (
                      <button
                        type="button"
                        onClick={() => void copyToken(token.id)}
                        className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] underline"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedTokenId === token.id ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                    <button onClick={() => revokeToken(token.id)} className="text-sm text-red-500 underline">Revoke</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-5 grid gap-3 border-t border-[color:var(--line)] pt-4 md:grid-cols-2">
        <div className="flex items-center gap-2 rounded-[18px] bg-[color:var(--surface-2)] px-4 py-3 text-sm font-medium text-[color:var(--foreground)]">
          <TerminalSquare className="h-4 w-4 text-[color:var(--accent)]" />
          Planned CLI path
        </div>
        <div className="flex items-center gap-2 rounded-[18px] bg-[color:var(--surface-2)] px-4 py-3 text-sm font-medium text-[color:var(--foreground)]">
          <ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />
          Rules for the real implementation
        </div>
      </div>
    </section>
  );
}
