"use client";

import { useEffect, useState } from "react";
import type { AiConfig, ProviderType } from "@starlens/core";
import { Bot, Plus } from "lucide-react";
import { ApiClientError, fetchApi } from "@/lib/api-client";

const providerOptions: Array<{ label: string; value: ProviderType }> = [
  { label: "OpenAI compatible", value: "openai_compatible" },
  { label: "Vercel AI Gateway", value: "vercel_gateway" },
  { label: "Anthropic native", value: "anthropic_native" },
  { label: "Gemini native", value: "gemini_native" },
];

export function AISettingsView() {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    apiKey: "",
    baseUrl: "",
    displayName: "",
    enabled: true,
    isDefault: false,
    model: "",
    providerType: "openai_compatible" as ProviderType,
  });

  const loadConfigs = async (signal?: AbortSignal) => {
    try {
      const data = await fetchApi<AiConfig[]>("/api/ai/configs", { signal });
      setError(null);
      setConfigs(data);
      setSelectedId((prev) => prev ?? data[0]?.id ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiClientError ? err.message : "Failed to load AI configs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadConfigs(controller.signal));
    return () => controller.abort();
  }, []);

  const selected = configs.find((config) => config.id === selectedId) ?? null;

  const updateForm = (updates: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const createConfig = async () => {
    try {
      setMessage(null);
      setError(null);
      await fetchApi<AiConfig>("/api/ai/configs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: form.apiKey || undefined,
          baseUrl: form.baseUrl || undefined,
          displayName: form.displayName,
          enabled: form.enabled,
          isDefault: form.isDefault,
          model: form.model,
          providerType: form.providerType,
        }),
      });
      setForm((current) => ({ ...current, apiKey: "" }));
      await loadConfigs();
      setMessage("Provider config saved.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create AI config.");
    }
  };

  const patchSelected = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await fetchApi<AiConfig>(`/api/ai/configs/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadConfigs();
      setMessage("Provider config updated.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update AI config.");
    }
  };

  const validateSelected = async () => {
    if (!selected) return;
    try {
      const result = await fetchApi<{ message: string; status: string }>(
        `/api/ai/configs/${selected.id}/validate`,
        { method: "POST" },
      );
      await loadConfigs();
      setMessage(result.message || `Validation ${result.status}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to validate AI config.");
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5 flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" />
          Saved providers
        </div>
        {message ? <p className="mb-3 text-sm text-emerald-500">{message}</p> : null}
        {error ? (
          <div className="mb-3 text-sm text-red-500">
            {error}{" "}
            <button
              className="underline"
              onClick={() => {
                setLoading(true);
                loadConfigs();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {loading ? (
          <div data-testid="ai-skeleton" className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded bg-[color:var(--surface-2)]"
              />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <p className="rounded border border-dashed p-4 text-sm">No providers yet.</p>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <article key={config.id} className="rounded border p-3">
                <div className="flex justify-between gap-3">
                  <button
                    onClick={() => setSelectedId(config.id)}
                    className="text-left font-semibold"
                  >
                    {config.displayName}
                  </button>
                  <button
                    onClick={async () => {
                      await fetchApi(`/api/ai/configs/${config.id}`, { method: "DELETE" });
                      await loadConfigs();
                    }}
                    className="text-sm text-red-500 underline"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  {config.providerType} · {config.model}
                  {config.isDefault ? " · default" : ""}
                  {config.lastValidationStatus ? ` · ${config.lastValidationStatus}` : ""}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="app-panel rounded-[24px] p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.displayName}
            onChange={(event) => updateForm({ displayName: event.target.value })}
            placeholder="Display name"
            className="h-10 rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
          />
          <select
            value={form.providerType}
            onChange={(event) =>
              updateForm({ providerType: event.target.value as ProviderType })
            }
            className="h-10 rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={form.model}
            onChange={(event) => updateForm({ model: event.target.value })}
            placeholder="Model"
            className="h-10 rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
          />
          <input
            value={form.baseUrl}
            onChange={(event) => updateForm({ baseUrl: event.target.value })}
            placeholder="Base URL"
            className="h-10 rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
          />
          <input
            value={form.apiKey}
            onChange={(event) => updateForm({ apiKey: event.target.value })}
            placeholder="API key"
            type="password"
            className="h-10 rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none md:col-span-2"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <input
              checked={form.enabled}
              onChange={(event) => updateForm({ enabled: event.target.checked })}
              type="checkbox"
            />
            Enabled
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <input
              checked={form.isDefault}
              onChange={(event) => updateForm({ isDefault: event.target.checked })}
              type="checkbox"
            />
            Default
          </label>
          <button
            onClick={createConfig}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Create config
          </button>
        </div>

        {selected ? (
          <div className="mt-6 space-y-3 rounded-[18px] border border-[color:var(--line)] p-4">
            <div className="text-sm font-medium">Editing: {selected.displayName}</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <button
                className="underline"
                onClick={() => patchSelected({ isDefault: true })}
              >
                Set default
              </button>
              <button className="underline" onClick={validateSelected}>
                Validate
              </button>
              <button
                className="underline"
                onClick={async () => {
                  await fetchApi(`/api/ai/configs/${selected.id}/models`);
                  setMessage("Model list fetched.");
                }}
              >
                Fetch models
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
