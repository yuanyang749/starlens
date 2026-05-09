"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "@starlens/core";
import { KeyRound, Plus, ShieldCheck, TerminalSquare } from "lucide-react";
import { ApiClientError, fetchApi } from "@/lib/api-client";

type CreatedToken = TokenRecord & { token?: string };

export function TokensSettingsView() {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

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
    const name = `Token ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    try {
      const token = await fetchApi<CreatedToken>("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, note: noteDraft.trim() }),
      });
      setCreatedToken(token.token ?? null);
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
      setCreatedToken(null);
      await loadTokens();
      setToast("Token revoked.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to revoke token.");
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
              <KeyRound className="h-4 w-4 text-[color:var(--accent)]" />
              Active tokens
            </div>
          </div>
          <button type="button" onClick={createToken} className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white">
            <Plus className="h-4 w-4" />New token
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Remark
          </span>
          <input
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Remark for this token"
            className="h-11 w-full rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
          />
        </label>

        {toast ? <p className="mb-3 text-sm text-emerald-500">{toast}</p> : null}
        {createdToken ? (
          <div className="mb-3 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3">
            <p className="text-xs font-medium text-[color:var(--muted)]">
              New token
            </p>
            <p className="mt-2 break-all font-mono text-sm text-[color:var(--foreground)]">
              {createdToken}
            </p>
          </div>
        ) : null}
        {error ? <div className="mb-3 rounded border border-red-400 p-3 text-sm text-red-500">{error} <button onClick={() => { setLoading(true); loadTokens(); }} className="underline">Retry</button></div> : null}

        {loading ? (
          <div className="space-y-3" data-testid="tokens-skeleton">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded bg-[color:var(--surface-2)]" />)}</div>
        ) : tokens.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-[color:var(--line)] p-4 text-sm text-[color:var(--muted)]">No tokens yet.</p>
        ) : (
          <div className="space-y-4">{tokens.map((token) => <article key={token.id} className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">{token.name}</h2>{token.note ? <p className="mt-1 text-sm text-[color:var(--foreground)]">{token.note}</p> : null}<p className="mt-1 font-mono text-sm text-[color:var(--muted)]">{token.tokenPrefix}...</p></div><button onClick={() => revokeToken(token.id)} className="text-sm text-red-500 underline">Revoke</button></div></article>)}</div>
        )}
      </section>

      <section className="space-y-5">
        <div className="app-panel rounded-[24px] p-5"><div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]"><TerminalSquare className="h-4 w-4 text-[color:var(--accent)]" />Planned CLI path</div></div>
        <div className="app-panel rounded-[24px] p-5"><div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]"><ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />Rules for the real implementation</div></div>
      </section>
    </div>
  );
}
