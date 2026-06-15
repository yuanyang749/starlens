"use client";

import { useEffect, useState } from "react";
import type { AiConfig, ProviderType } from "@starlens/core";
import { Bot, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiClientError, fetchApi } from "@/lib/api-client";

const providerOptions: Array<{ label: string; value: ProviderType }> = [
  { label: "OpenAI-compatible", value: "openai_compatible" },
  { label: "Vercel AI Gateway", value: "vercel_gateway" },
  { label: "Anthropic Native", value: "anthropic_native" },
  { label: "Gemini Native", value: "gemini_native" },
];

function formatValidationStatus(status: string) {
  if (status === "success") return "验证成功";
  if (status === "warning") return "验证警告";
  if (status === "error") return "验证失败";
  return status;
}

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
      setError(err instanceof ApiClientError ? err.message : "AI 配置加载失败。");
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
      setMessage("Provider 配置已保存。");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "AI 配置创建失败。");
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
      setMessage("Provider 配置已更新。");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "AI 配置更新失败。");
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
      if (result.status === "error") {
        setMessage(null);
        setError(result.message || "Provider 验证失败。");
        return;
      }
      setError(null);
      setMessage(result.message || `验证${result.status === "success" ? "成功" : `结果：${result.status}`}。`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "AI 配置验证失败。");
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5 flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" />
          已保存 Provider
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
              重试
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
          <p className="rounded border border-dashed p-4 text-sm">暂无 Provider。</p>
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
                    删除
                  </button>
                </div>
                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  {config.providerType} · {config.model}
                  {config.isDefault ? " · 默认" : ""}
                  {config.lastValidationStatus ? ` · ${formatValidationStatus(config.lastValidationStatus)}` : ""}
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
            placeholder="显示名称"
            className="h-10 rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none"
          />
          <Select
            value={form.providerType}
            onValueChange={(value) => updateForm({ providerType: value as ProviderType })}
          >
            <SelectTrigger
              aria-label="Provider 类型"
              className="ai-provider-select-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="ai-provider-select-content" position="popper">
              {providerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            value={form.model}
            onChange={(event) => updateForm({ model: event.target.value })}
            placeholder="模型"
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
            placeholder="API Key"
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
            启用
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <input
              checked={form.isDefault}
              onChange={(event) => updateForm({ isDefault: event.target.checked })}
              type="checkbox"
            />
            默认
          </label>
          <button
            onClick={createConfig}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            创建配置
          </button>
        </div>

        {selected ? (
          <div className="mt-6 space-y-3 rounded-[18px] border border-[color:var(--line)] p-4">
            <div className="text-sm font-medium">正在编辑：{selected.displayName}</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <button
                className="underline"
                onClick={() => patchSelected({ isDefault: true })}
              >
                设为默认
              </button>
              <button className="underline" onClick={validateSelected}>
                验证
              </button>
              <button
                className="underline"
                onClick={async () => {
                  await fetchApi(`/api/ai/configs/${selected.id}/models`);
                  setMessage("模型列表已获取。");
                }}
              >
                获取模型
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
