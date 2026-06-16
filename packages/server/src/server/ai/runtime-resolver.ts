import type { ProviderType } from "@starlens/core";

export type AiRuntimeConfig = {
  id: string;
  providerType: ProviderType;
  model: string;
  baseUrl: string | null;
  apiKey: string;
  extraHeaders: Record<string, string>;
};

export type AiRuntimeConfigSource = "user_default" | "system_default" | "none";
export type AiRuntimeCapability = "chat_completions";
export type AiRuntimeConfigResolution = {
  config: AiRuntimeConfig | null;
  source: AiRuntimeConfigSource;
};
export type SystemDefaultAiRuntimeStatus = {
  baseUrl: string | null;
  configured: boolean;
  enabled: boolean;
  model: string | null;
  providerType: ProviderType | null;
  source: "system_default";
};

export const providerDefaults: Record<ProviderType, string | null> = {
  anthropic_native: "https://api.anthropic.com",
  gemini_native: "https://generativelanguage.googleapis.com",
  openai_compatible: null,
  vercel_gateway: "https://ai-gateway.vercel.sh/v1",
};

const providerTypes = new Set<ProviderType>([
  "vercel_gateway",
  "openai_compatible",
  "anthropic_native",
  "gemini_native",
]);

const chatCompletionProviderTypes = new Set<ProviderType>([
  "openai_compatible",
  "vercel_gateway",
]);

const systemDefaultRuntimeId = "system:default";

export function normalizeProviderType(value: unknown): ProviderType | null {
  return typeof value === "string" && providerTypes.has(value as ProviderType)
    ? (value as ProviderType)
    : null;
}

export function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function systemEnvValue(env: NodeJS.ProcessEnv, nextKey: string, legacyKey?: string) {
  return cleanString(env[nextKey]) ?? (legacyKey ? cleanString(env[legacyKey]) : undefined);
}

export function supportsRuntimeCapability(
  config: AiRuntimeConfig | null,
  capability: AiRuntimeCapability,
): config is AiRuntimeConfig & { baseUrl: string } {
  if (!config || !config.apiKey.trim()) {
    return false;
  }

  if (capability === "chat_completions") {
    return Boolean(
      config.baseUrl?.trim()
      && chatCompletionProviderTypes.has(config.providerType),
    );
  }

  return false;
}

function parseSystemExtraHeaders(env: NodeJS.ProcessEnv) {
  const raw = systemEnvValue(env, "SYSTEM_AI_EXTRA_HEADERS");
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

// 中文注释：系统级默认 Provider 用于“用户未配置默认 AI”时的受控回退，兼容旧的 OPENAI_* 命名以便平滑迁移。
export function resolveSystemDefaultAiRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AiRuntimeConfig | null {
  const enabled = systemEnvValue(env, "SYSTEM_AI_ENABLED")?.toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "off") {
    return null;
  }

  const providerType = normalizeProviderType(systemEnvValue(env, "SYSTEM_AI_PROVIDER_TYPE"))
    ?? "openai_compatible";
  const apiKey = systemEnvValue(env, "SYSTEM_AI_API_KEY", "OPENAI_API_KEY");
  const model = systemEnvValue(env, "SYSTEM_AI_MODEL", "OPENAI_MODEL_KEY");
  const baseUrl = systemEnvValue(env, "SYSTEM_AI_BASE_URL", "OPENAI_BASE_URL")
    ?? providerDefaults[providerType];

  if (!apiKey || !model) {
    return null;
  }

  if (chatCompletionProviderTypes.has(providerType) && !baseUrl) {
    return null;
  }

  return {
    id: systemDefaultRuntimeId,
    providerType,
    model,
    baseUrl,
    apiKey,
    extraHeaders: parseSystemExtraHeaders(env),
  };
}

export function getSystemDefaultAiRuntimeStatus(
  env: NodeJS.ProcessEnv = process.env,
): SystemDefaultAiRuntimeStatus {
  const enabledValue = systemEnvValue(env, "SYSTEM_AI_ENABLED")?.toLowerCase();
  const enabled = !(enabledValue === "false" || enabledValue === "0" || enabledValue === "off");
  const providerType = normalizeProviderType(systemEnvValue(env, "SYSTEM_AI_PROVIDER_TYPE"))
    ?? "openai_compatible";
  const model = systemEnvValue(env, "SYSTEM_AI_MODEL", "OPENAI_MODEL_KEY") ?? null;
  const baseUrl = systemEnvValue(env, "SYSTEM_AI_BASE_URL", "OPENAI_BASE_URL")
    ?? providerDefaults[providerType];
  const apiKey = systemEnvValue(env, "SYSTEM_AI_API_KEY", "OPENAI_API_KEY");
  const config = resolveSystemDefaultAiRuntimeConfig(env);

  // 中文注释：该状态只暴露可展示的元信息，严禁把系统级 API Key 返回给浏览器。
  return {
    baseUrl: baseUrl ?? null,
    configured: Boolean(config && apiKey),
    enabled,
    model,
    providerType: enabled ? providerType : null,
    source: "system_default",
  };
}
