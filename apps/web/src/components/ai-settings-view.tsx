"use client";

import { useEffect, useRef, useState } from "react";
import type { AiConfig, ProviderType } from "@starlens-app/core";
import { Bot, Pencil, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
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
  { label: "Anthropic Native", value: "anthropic_native" },
  { label: "Gemini Native", value: "gemini_native" },
  { label: "DeepSeek Native", value: "deepseek_native" },
];

const inputClass =
  "h-10 w-full rounded-full border border-[color:var(--line)] bg-white px-4 text-sm outline-none transition focus:border-[color:rgba(37,99,235,0.48)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]";

const labelClass = "block text-xs font-medium text-[color:var(--muted)]";

type SystemDefaultAiStatus = {
  baseUrl: string | null;
  configured: boolean;
  enabled: boolean;
  model: string | null;
  providerType: ProviderType | null;
  source: "system_default";
};

function formatValidationStatus(status: string) {
  if (status === "success") return "验证成功";
  if (status === "warning") return "验证警告";
  if (status === "error") return "验证失败";
  return status;
}

export function AISettingsView({ isAdmin = true }: { isAdmin?: boolean }) {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [systemDefault, setSystemDefault] = useState<SystemDefaultAiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState<Record<string, "validating" | "fetching-models" | "saving" | null>>({});
  const [cardMessage, setCardMessage] = useState<Record<string, { type: "ok" | "err"; text: string } | null>>({});
  const cardMessageTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, {
    displayName: string; providerType: ProviderType; model: string;
    baseUrl: string; apiKey: string; enabled: boolean; isDefault: boolean;
  }>>({});;
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiClientError ? err.message : "AI 配置加载失败。");
    } finally {
      setLoading(false);
    }
  };

  const loadSystemDefaultStatus = async (signal?: AbortSignal) => {
    try {
      const data = await fetchApi<SystemDefaultAiStatus>("/api/ai/system-default", { signal });
      setSystemDefault(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSystemDefault(null);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      loadConfigs(controller.signal),
      loadSystemDefaultStatus(controller.signal),
    ]);
    return () => controller.abort();
  }, []);

  const userDefault = configs.find((config) => config.isDefault && config.enabled) ?? null;
  const isUsingSystemDefault = !userDefault && Boolean(systemDefault?.configured && systemDefault.enabled);
  const runtimeStatusTitle = userDefault
    ? "当前使用：用户默认 Provider"
    : isUsingSystemDefault
      ? "当前使用：系统默认 AI"
      : "当前没有默认 AI Provider";
  const runtimeStatusDetail = userDefault
    ? `${userDefault.displayName} · ${userDefault.providerType} · ${userDefault.model}`
    : isUsingSystemDefault
      ? isAdmin
        ? `${systemDefault?.providerType ?? "openai_compatible"} · ${systemDefault?.model ?? "未设置模型"}`
        : "系统默认 AI 已启用"
      : "创建并设为默认后，工作台 AI 问答会优先使用你的 Provider。";

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

  const setCardMsg = (id: string, msg: { type: "ok" | "err"; text: string } | null) => {
    if (cardMessageTimers.current[id]) clearTimeout(cardMessageTimers.current[id]);
    setCardMessage((prev) => ({ ...prev, [id]: msg }));
    if (msg) {
      cardMessageTimers.current[id] = setTimeout(() => {
        setCardMessage((prev) => ({ ...prev, [id]: null }));
      }, 4000);
    }
  };

  const validateConfig = async (id: string) => {
    setCardBusy((prev) => ({ ...prev, [id]: "validating" }));
    try {
      const result = await fetchApi<{ message: string; status: string }>(
        `/api/ai/configs/${id}/validate`,
        { method: "POST" },
      );
      await loadConfigs();
      setCardMsg(id, {
        type: result.status === "success" ? "ok" : "err",
        text: result.message || (result.status === "success" ? "验证成功" : "验证失败"),
      });
    } catch (err) {
      setCardMsg(id, { type: "err", text: err instanceof ApiClientError ? err.message : "验证失败" });
    } finally {
      setCardBusy((prev) => ({ ...prev, [id]: null }));
    }
  };

  const openEdit = (config: AiConfig) => {
    setEditForms((prev) => ({
      ...prev,
      [config.id]: {
        displayName: config.displayName,
        providerType: config.providerType,
        model: config.model,
        baseUrl: config.baseUrl ?? "",
        apiKey: "",
        enabled: config.enabled,
        isDefault: config.isDefault,
      },
    }));
    setEditingId(config.id);
  };

  const updateEditForm = (id: string, updates: Partial<typeof editForms[string]>) => {
    setEditForms((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));
  };

  const saveEdit = async (id: string) => {
    const ef = editForms[id];
    if (!ef) return;
    setCardBusy((prev) => ({ ...prev, [id]: "saving" }));
    try {
      await fetchApi<AiConfig>(`/api/ai/configs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: ef.displayName,
          providerType: ef.providerType,
          model: ef.model,
          baseUrl: ef.baseUrl || undefined,
          apiKey: ef.apiKey || undefined,
          enabled: ef.enabled,
          isDefault: ef.isDefault,
        }),
      });
      await loadConfigs();
      setEditingId(null);
      setCardMsg(id, { type: "ok", text: "配置已保存" });
    } catch (err) {
      setCardMsg(id, { type: "err", text: err instanceof ApiClientError ? err.message : "保存失败" });
    } finally {
      setCardBusy((prev) => ({ ...prev, [id]: null }));
    }
  };

  const toggleConfigField = async (config: AiConfig, field: "enabled" | "isDefault", value: boolean) => {
    setCardBusy((prev) => ({ ...prev, [config.id]: "saving" }));
    try {
      await fetchApi<AiConfig>(`/api/ai/configs/${config.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          [field]: value,
        }),
      });
      if (editForms[config.id]) {
        updateEditForm(config.id, { [field]: value });
      }
      await loadConfigs();
    } catch (err) {
      setCardMsg(config.id, { type: "err", text: err instanceof ApiClientError ? err.message : "更新失败" });
    } finally {
      setCardBusy((prev) => ({ ...prev, [config.id]: null }));
    }
  };

  const fetchModels = async (id: string) => {
    setCardBusy((prev) => ({ ...prev, [id]: "fetching-models" }));
    try {
      await fetchApi(`/api/ai/configs/${id}/models`);
      setCardMsg(id, { type: "ok", text: "模型列表已刷新" });
    } catch (err) {
      setCardMsg(id, { type: "err", text: err instanceof ApiClientError ? err.message : "获取模型失败" });
    } finally {
      setCardBusy((prev) => ({ ...prev, [id]: null }));
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5 flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" />
          已保存 Provider
        </div>
        <div className="mb-4 rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
          <div className="text-sm font-medium">{runtimeStatusTitle}</div>
          <div className="mt-1 text-xs text-[color:var(--muted)]">{runtimeStatusDetail}</div>
          {isUsingSystemDefault && systemDefault?.baseUrl && isAdmin ? (
            <div className="mt-1 text-xs text-[color:var(--muted)]">
              Base URL：{systemDefault.baseUrl}
            </div>
          ) : null}
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
            {configs.map((config) => {
              const busy = cardBusy[config.id];
              const msg = cardMessage[config.id];
              const isEditing = editingId === config.id;
              const ef = editForms[config.id];
              const pillBtn = "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] px-3 py-1 text-xs font-medium text-[color:var(--foreground)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-40";
              return (
                <article key={config.id} className="rounded-[14px] border border-[color:var(--line)] bg-[color:var(--surface)] p-4 transition-shadow hover:shadow-sm">
                  {/* ── 标题行 ── */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{config.displayName}</p>
                      <p className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
                        {config.providerType} · {config.model}
                        {config.isDefault ? " · 默认" : ""}
                        {config.lastValidationStatus ? ` · ${formatValidationStatus(config.lastValidationStatus)}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await fetchApi(`/api/ai/configs/${config.id}`, { method: "DELETE" });
                        await loadConfigs();
                      }}
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>

                  {/* ── 快速配置行 ── */}
                  <div className="mt-2.5 flex items-center gap-4 text-xs font-medium text-[color:var(--muted)]">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        disabled={busy === "saving"}
                        onChange={(e) => toggleConfigField(config, "enabled", e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-[color:var(--line)] accent-[color:var(--accent)] cursor-pointer"
                      />
                      启用
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.isDefault}
                        disabled={busy === "saving"}
                        onChange={(e) => toggleConfigField(config, "isDefault", e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-[color:var(--line)] accent-[color:var(--accent)] cursor-pointer"
                      />
                      设为默认
                    </label>
                  </div>

                  {/* ── 操作按钮行 ── */}
                  <div className="mt-3 flex items-center gap-2">
                    <button disabled={!!busy} onClick={() => validateConfig(config.id)} className={pillBtn}>
                      <ShieldCheck className="h-3 w-3" />
                      {busy === "validating" ? "验证中…" : "验证"}
                    </button>
                    <button disabled={!!busy} onClick={() => fetchModels(config.id)} className={pillBtn}>
                      <RefreshCw className={`h-3 w-3 ${busy === "fetching-models" ? "animate-spin" : ""}`} />
                      {busy === "fetching-models" ? "获取中…" : "获取模型"}
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => isEditing ? setEditingId(null) : openEdit(config)}
                      className={`${pillBtn} ${isEditing ? "border-[color:var(--accent)] text-[color:var(--accent)]" : ""}`}
                    >
                      {isEditing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      {isEditing ? "取消" : "编辑"}
                    </button>
                  </div>

                  {/* ── 行内编辑表单 ── */}
                  {isEditing && ef ? (
                    <div className="mt-4 space-y-3 border-t border-[color:var(--line)] pt-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className={labelClass}>显示名称</label>
                          <input
                            value={ef.displayName}
                            onChange={(e) => updateEditForm(config.id, { displayName: e.target.value })}
                            className={inputClass}
                            placeholder="例如：我的 OpenAI"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={labelClass}>模型</label>
                          <input
                            value={ef.model}
                            onChange={(e) => updateEditForm(config.id, { model: e.target.value })}
                            className={inputClass}
                            placeholder="例如：gpt-4o-mini"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>Provider 类型</label>
                        <Select
                          value={ef.providerType}
                          onValueChange={(v) => updateEditForm(config.id, { providerType: v as ProviderType })}
                        >
                          <SelectTrigger className="ai-provider-select-trigger">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="ai-provider-select-content" position="popper">
                            {providerOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>Base URL</label>
                        <input
                          value={ef.baseUrl}
                          onChange={(e) => updateEditForm(config.id, { baseUrl: e.target.value })}
                          className={inputClass}
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>API Key（留空不修改）</label>
                        <input
                          value={ef.apiKey}
                          onChange={(e) => updateEditForm(config.id, { apiKey: e.target.value })}
                          className={inputClass}
                          type="password"
                          placeholder="sk-..."
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-xs text-[color:var(--muted)]">
                          <input
                            type="checkbox"
                            checked={ef.enabled}
                            onChange={(e) => updateEditForm(config.id, { enabled: e.target.checked })}
                          />
                          启用
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-[color:var(--muted)]">
                          <input
                            type="checkbox"
                            checked={ef.isDefault}
                            onChange={(e) => updateEditForm(config.id, { isDefault: e.target.checked })}
                          />
                          设为默认
                        </label>
                        <button
                          disabled={busy === "saving"}
                          onClick={() => saveEdit(config.id)}
                          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-black px-4 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {busy === "saving" ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {msg ? (
                    <p className={`mt-2 text-xs font-medium ${msg.type === "ok" ? "text-emerald-500" : "text-red-500"}`}>
                      {msg.text}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="app-panel rounded-[24px] p-5">
        <div className="mb-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" />
            新建 Provider
          </div>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            填写下方信息接入新的 AI 服务商，创建后可随时验证或设为默认。
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="ai-provider-type">
              Provider 类型
            </label>
            <Select
              value={form.providerType}
              onValueChange={(value) => updateForm({ providerType: value as ProviderType })}
            >
              <SelectTrigger
                id="ai-provider-type"
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
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="ai-display-name">
                显示名称
              </label>
              <input
                id="ai-display-name"
                value={form.displayName}
                onChange={(event) => updateForm({ displayName: event.target.value })}
                placeholder="例如：我的 OpenAI"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="ai-model">
                模型
              </label>
              <input
                id="ai-model"
                value={form.model}
                onChange={(event) => updateForm({ model: event.target.value })}
                placeholder="例如：gpt-4o-mini"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="ai-base-url">
              Base URL
            </label>
            <input
              id="ai-base-url"
              value={form.baseUrl}
              onChange={(event) => updateForm({ baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="ai-api-key">
              API Key
            </label>
            <input
              id="ai-api-key"
              value={form.apiKey}
              onChange={(event) => updateForm({ apiKey: event.target.value })}
              placeholder="sk-..."
              type="password"
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[color:var(--line)] pt-4">
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
            设为默认
          </label>
          <button
            onClick={createConfig}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            创建配置
          </button>
        </div>

      </section>
    </div>
  );
}
