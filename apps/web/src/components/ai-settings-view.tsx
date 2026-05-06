"use client";

import { useEffect, useState } from "react";
import type { AiConfig } from "@starlens/core";
import { Bot } from "lucide-react";
import { ApiClientError, fetchApi } from "@/lib/api-client";

export function AISettingsView() {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = configs.find((c) => c.id === selectedId) ?? null;
  const patchSelected = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    await fetchApi<AiConfig>(`/api/ai/configs/${selected.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    await loadConfigs();
  };

  return <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]"><section className="app-panel rounded-[24px] p-5"><div className="mb-5 flex items-center gap-2 text-sm font-medium"><Bot className="h-4 w-4" />Saved providers</div>{error ? <div className="mb-3 text-sm text-red-500">{error} <button className="underline" onClick={() => { setLoading(true); loadConfigs(); }}>Retry</button></div> : null}{loading ? <div data-testid="ai-skeleton" className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded bg-[color:var(--surface-2)]" />)}</div> : configs.length === 0 ? <p className="rounded border border-dashed p-4 text-sm">No providers yet.</p> : <div className="space-y-3">{configs.map((config) => <article key={config.id} className="rounded border p-3"><div className="flex justify-between"><button onClick={() => setSelectedId(config.id)} className="font-semibold">{config.displayName}</button><button onClick={async () => { await fetchApi(`/api/ai/configs/${config.id}`, { method: "DELETE" }); await loadConfigs(); }} className="text-sm text-red-500 underline">Delete</button></div><div className="mt-2 flex gap-3 text-xs"><button onClick={() => patchSelected({ isDefault: true })} className="underline">Set default</button><button onClick={async () => { if (!selected) return; await fetchApi(`/api/ai/configs/${selected.id}/validate`, { method: "POST" }); }} className="underline">Validate</button><button onClick={async () => { if (!selected) return; await fetchApi(`/api/ai/configs/${selected.id}/models`); }} className="underline">Fetch models</button></div></article>)}</div>}<button onClick={async () => { await fetchApi<AiConfig>("/api/ai/configs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "New Provider", providerType: "openai_compatible", model: "deepseek-chat" }) }); await loadConfigs(); }} className="mt-4 rounded bg-black px-3 py-2 text-sm text-white">Create config</button></section><section className="app-panel rounded-[24px] p-5">{selected ? <div className="space-y-3"><div className="text-sm">Editing: {selected.displayName}</div><button className="underline" onClick={() => patchSelected({ displayName: `${selected.displayName} (edited)` })}>Edit name</button></div> : null}</section></div>;
}
