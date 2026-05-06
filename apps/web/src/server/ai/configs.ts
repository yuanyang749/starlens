import "server-only";

import { and, eq } from "drizzle-orm";
import type { AiConfig, ProviderType } from "@starlens/core";
import { getDb } from "@/db/client";
import { userAiConfigs } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto/secrets";

type AiConfigRow = typeof userAiConfigs.$inferSelect;
type AiConfigInput = {
  apiKey?: string | null;
  baseUrl?: string | null;
  displayName?: string;
  enabled?: boolean;
  extraHeaders?: Record<string, string> | null;
  isDefault?: boolean;
  model?: string;
  providerType?: ProviderType;
};

const providerTypes = new Set<ProviderType>([
  "vercel_gateway",
  "openai_compatible",
  "anthropic_native",
  "gemini_native",
]);

const providerDefaults: Record<ProviderType, string | null> = {
  anthropic_native: "https://api.anthropic.com",
  gemini_native: "https://generativelanguage.googleapis.com",
  openai_compatible: null,
  vercel_gateway: "https://ai-gateway.vercel.sh/v1",
};

function toApiConfig(config: AiConfigRow): AiConfig {
  return {
    id: config.id,
    displayName: config.displayName,
    providerType: config.providerType as ProviderType,
    model: config.model,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
    isDefault: config.isDefault,
    lastValidatedAt: config.lastValidatedAt?.toISOString() ?? null,
    lastValidationStatus: config.lastValidationStatus as AiConfig["lastValidationStatus"],
    lastValidationError: config.lastValidationError,
  };
}

function normalizeProviderType(value: unknown): ProviderType | null {
  return typeof value === "string" && providerTypes.has(value as ProviderType)
    ? (value as ProviderType)
    : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function encryptHeaders(headers?: Record<string, string> | null) {
  if (!headers || Object.keys(headers).length === 0) {
    return null;
  }

  return encryptSecret(JSON.stringify(headers));
}

function decryptHeaders(value: string | null) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(decryptSecret(value));
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

async function clearDefaultConfig(userId: string) {
  await getDb()
    .update(userAiConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(userAiConfigs.userId, userId), eq(userAiConfigs.isDefault, true)));
}

async function getConfigRow(userId: string, id: string) {
  return getDb().query.userAiConfigs.findFirst({
    where: and(eq(userAiConfigs.userId, userId), eq(userAiConfigs.id, id)),
  });
}

export async function listAiConfigs(userId: string) {
  const rows = await getDb().query.userAiConfigs.findMany({
    where: eq(userAiConfigs.userId, userId),
    orderBy: (configs, { desc }) => [desc(configs.isDefault), desc(configs.createdAt)],
  });

  return rows.map(toApiConfig);
}

export async function createAiConfig(userId: string, input: AiConfigInput) {
  const providerType = normalizeProviderType(input.providerType);
  const displayName = cleanString(input.displayName);
  const model = cleanString(input.model);

  if (!providerType || !displayName || !model) {
    throw new Error("Display name, provider type, and model are required.");
  }

  if (input.isDefault) {
    await clearDefaultConfig(userId);
  }

  const [created] = await getDb()
    .insert(userAiConfigs)
    .values({
      userId,
      displayName,
      providerType,
      model,
      baseUrl: cleanString(input.baseUrl) ?? providerDefaults[providerType],
      apiKeyEncrypted: cleanString(input.apiKey)
        ? encryptSecret(cleanString(input.apiKey)!)
        : null,
      extraHeadersEncrypted: encryptHeaders(input.extraHeaders),
      enabled: input.enabled ?? true,
      isDefault: input.isDefault ?? false,
      lastValidationStatus: "warning",
    })
    .returning();

  return toApiConfig(created);
}

export async function updateAiConfig(userId: string, id: string, input: AiConfigInput) {
  const existing = await getConfigRow(userId, id);
  if (!existing) return null;

  const providerType = input.providerType
    ? normalizeProviderType(input.providerType)
    : undefined;
  if (input.providerType && !providerType) {
    throw new Error("Provider type is invalid.");
  }

  if (input.isDefault) {
    await clearDefaultConfig(userId);
  }

  const nextProviderType = providerType ?? existing.providerType as ProviderType;
  const patch: Partial<typeof userAiConfigs.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.displayName !== undefined) patch.displayName = cleanString(input.displayName);
  if (input.model !== undefined) patch.model = cleanString(input.model);
  if (input.baseUrl !== undefined) {
    patch.baseUrl = cleanString(input.baseUrl) ?? providerDefaults[nextProviderType];
  }
  if (providerType) patch.providerType = providerType;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  if (input.apiKey !== undefined) {
    patch.apiKeyEncrypted = cleanString(input.apiKey)
      ? encryptSecret(cleanString(input.apiKey)!)
      : null;
  }
  if (input.extraHeaders !== undefined) {
    patch.extraHeadersEncrypted = encryptHeaders(input.extraHeaders);
  }

  const [updated] = await getDb()
    .update(userAiConfigs)
    .set(patch)
    .where(and(eq(userAiConfigs.userId, userId), eq(userAiConfigs.id, id)))
    .returning();

  return updated ? toApiConfig(updated) : null;
}

export async function deleteAiConfig(userId: string, id: string) {
  const deleted = await getDb()
    .delete(userAiConfigs)
    .where(and(eq(userAiConfigs.userId, userId), eq(userAiConfigs.id, id)))
    .returning({ id: userAiConfigs.id });

  return deleted.length > 0;
}

function resolveProviderBase(config: AiConfigRow) {
  return config.baseUrl || providerDefaults[config.providerType as ProviderType];
}

function openAiModelsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/v1") ? `${path}/models` : `${path}/v1/models`;
  return url.toString();
}

async function fetchProviderModels(config: AiConfigRow) {
  const providerType = config.providerType as ProviderType;
  const baseUrl = resolveProviderBase(config);
  const apiKey = config.apiKeyEncrypted ? decryptSecret(config.apiKeyEncrypted) : "";
  const extraHeaders = decryptHeaders(config.extraHeadersEncrypted);

  if (!apiKey) {
    throw new Error("API key is required for provider validation.");
  }

  let url: string;
  const headers: Record<string, string> = { ...extraHeaders };

  if (providerType === "anthropic_native") {
    url = `${baseUrl}/v1/models`;
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (providerType === "gemini_native") {
    const geminiUrl = new URL(`${baseUrl}/v1beta/models`);
    geminiUrl.searchParams.set("key", apiKey);
    url = geminiUrl.toString();
  } else {
    if (!baseUrl) {
      throw new Error("Base URL is required for OpenAI-compatible providers.");
    }
    url = openAiModelsUrl(baseUrl);
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Provider validation failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    data?: Array<{ id?: string; display_name?: string }>;
    models?: Array<{ name?: string; displayName?: string }>;
  };

  if (Array.isArray(payload.data)) {
    return payload.data
      .map((model) => model.id && { id: model.id, label: model.display_name ?? model.id })
      .filter(Boolean) as Array<{ id: string; label: string }>;
  }

  if (Array.isArray(payload.models)) {
    return payload.models
      .map((model) => {
        const id = model.name?.replace(/^models\//, "");
        return id && { id, label: model.displayName ?? id };
      })
      .filter(Boolean) as Array<{ id: string; label: string }>;
  }

  return [];
}

export async function validateAiConfig(userId: string, id: string) {
  const config = await getConfigRow(userId, id);
  if (!config) return null;

  const validatedAt = new Date();
  try {
    await fetchProviderModels(config);
    await getDb()
      .update(userAiConfigs)
      .set({
        lastValidatedAt: validatedAt,
        lastValidationStatus: "success",
        lastValidationError: null,
        updatedAt: validatedAt,
      })
      .where(eq(userAiConfigs.id, id));

    return {
      status: "success",
      validatedAt: validatedAt.toISOString(),
      message: "Provider validation succeeded.",
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Provider validation failed.";
    await getDb()
      .update(userAiConfigs)
      .set({
        lastValidatedAt: validatedAt,
        lastValidationStatus: "error",
        lastValidationError: message,
        updatedAt: validatedAt,
      })
      .where(eq(userAiConfigs.id, id));

    return {
      status: "error",
      validatedAt: validatedAt.toISOString(),
      message,
    };
  }
}

export async function getAiConfigModels(userId: string, id: string) {
  const config = await getConfigRow(userId, id);
  if (!config) return null;

  try {
    return {
      providerType: config.providerType,
      models: await fetchProviderModels(config),
      source: "provider",
    };
  } catch {
    return {
      providerType: config.providerType,
      models: [],
      source: "manual_only",
    };
  }
}
