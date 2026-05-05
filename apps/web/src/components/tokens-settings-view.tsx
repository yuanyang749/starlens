"use client";

import { useEffect, useState } from "react";
import { mockTokens, type TokenRecord } from "@starlens/core";
import { KeyRound, Plus, ShieldCheck, TerminalSquare } from "lucide-react";

export function TokensSettingsView() {
  const [tokens, setTokens] = useState<TokenRecord[]>(mockTokens);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/tokens", { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { ok: boolean; data?: TokenRecord[] }) => {
        if (payload.ok && payload.data) {
          setTokens(payload.data);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
              <KeyRound className="h-4 w-4 text-[color:var(--accent)]" />
              Active tokens
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              Personal tokens power CLI and agent access without handing out GitHub OAuth credentials.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            New token
          </button>
        </div>
        <div className="space-y-4">
          {tokens.map((token) => (
            <article
              key={token.id}
              className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{token.name}</h2>
                  <p className="mt-1 font-mono text-sm text-[color:var(--muted)]">
                    {token.tokenPrefix}...
                  </p>
                </div>
                <span className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs text-[color:var(--muted)]">
                  Active
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[color:var(--muted)] sm:grid-cols-3">
                <p>Created {token.createdAt.slice(0, 10)}</p>
                <p>Last used {token.lastUsedAt?.slice(0, 10) ?? "Never"}</p>
                <p>No expiry</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="app-panel rounded-[24px] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
            <TerminalSquare className="h-4 w-4 text-[color:var(--accent)]" />
            Planned CLI path
          </div>
          <div className="rounded-[20px] border border-[color:var(--line)] bg-[#101820] p-4 font-mono text-sm leading-7 text-[#d8e4ef]">
            <div>$ stars login --token stl_dev_1...</div>
            <div>$ stars sync</div>
            <div>$ stars search &quot;remotion landing page&quot;</div>
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
            <ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />
            Rules for the real implementation
          </div>
          <div className="space-y-3 text-sm leading-7 text-[color:var(--muted)]">
            <p className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3">
              Show the full token only once at creation time.
            </p>
            <p className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3">
              Keep only hashed tokens in the database.
            </p>
            <p className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3">
              Revoke without deleting the audit trail.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
