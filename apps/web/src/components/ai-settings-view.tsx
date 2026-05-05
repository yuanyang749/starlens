"use client";

import { useEffect, useState } from "react";
import { mockAiConfigs, type AiConfig } from "@starlens/core";
import { Bot, CheckCircle2, Radio, ShieldCheck } from "lucide-react";

export function AISettingsView() {
  const [configs, setConfigs] = useState<AiConfig[]>(mockAiConfigs);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/ai/configs", { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { ok: boolean; data?: AiConfig[] }) => {
        if (payload.ok && payload.data) {
          setConfigs(payload.data);
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
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
          <Bot className="h-4 w-4 text-[color:var(--accent)]" />
          Saved providers
        </div>
        <div className="space-y-4">
          {configs.map((config) => (
            <article
              key={config.id}
              className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{config.displayName}</h2>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {config.providerType} · {config.model}
                  </p>
                </div>
                {config.isDefault ? (
                  <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--accent)]">
                    Default
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                <span className="rounded-full border border-[color:var(--line)] px-2.5 py-1">
                  {config.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="rounded-full border border-[color:var(--line)] px-2.5 py-1">
                  Checked {config.lastValidatedAt.slice(5, 10)}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
                {config.lastValidationError ?? "Validation looks healthy in this mock state."}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="app-panel rounded-[24px] p-5">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
            <ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />
            Provider editor shell
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Display name", "My Gateway"],
              ["Provider type", "openai_compatible"],
              ["Model", "deepseek-chat"],
              ["Base URL", "https://api.example.com"],
            ].map(([label, value]) => (
              <label key={label} className="flex flex-col gap-2 text-sm">
                <span className="text-[color:var(--muted)]">{label}</span>
                <div className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3 text-[color:var(--foreground)]">
                  {value}
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 rounded-[18px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface-2)] p-4 text-sm leading-7 text-[color:var(--muted)]">
            This milestone keeps the form static, but the layout is already
            shaped for validate, save, and model discovery flows.
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
            <Radio className="h-4 w-4 text-[color:var(--accent)]" />
            Expected controls
          </div>
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            {[
              "Validate connection before saving the provider.",
              "Keep exactly one default provider per user.",
              "Show model discovery when supported and fall back to manual model ids when not.",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--accent)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
