// HTTP API 客户端：fetch + 超时 + 重试 + 响应解析
import { setTimeout as delay } from "node:timers/promises";
import { CliError } from "./errors.mjs";
import { readToken } from "./token.mjs";

// 带超时的 fetch 封装。
export async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// 读取 token 并缓存到 config，避免每次 API 调用都读文件。
export async function getToken(config) {
  if (config._token) return config._token;
  const token = await readToken(config.tokenPath);
  config._token = token;
  return token;
}

// 解析标准响应信封 { ok, data | error }。
// 修复：HTTP 200 但 ok:false 时也带上 status，便于排查契约违反。
export function parseApiPayload(payload, status) {
  if (!payload || typeof payload !== "object") {
    throw new CliError("API returned an invalid JSON response.", 1, { status });
  }
  if (payload.ok === true) return payload.data;
  const message = payload.error?.message ?? "API request failed.";
  throw new CliError(message, 1, {
    status,
    apiCode: payload.error?.code,
  });
}

// 构造鉴权/限流/服务端错误的友好提示。
export function authErrorMessage(status, payload) {
  const apiMessage = payload?.error?.message;
  if (status === 401) {
    return `${apiMessage ?? "Authentication is required."} Run 'stars login --token <token>' with a valid token.`;
  }
  if (status === 403) {
    return `${apiMessage ?? "Access forbidden."} Check that your token has permission for this operation.`;
  }
  if (status === 429) {
    return `${apiMessage ?? "Rate limit exceeded."} Please wait and retry later, or reduce request frequency.`;
  }
  return apiMessage ?? `API request failed with status ${status}.`;
}

// 判断错误是否值得重试：
//  - CliError 且 status 为 5xx：可重试（服务端瞬时错误）
//  - 网络错误（非 CliError，如 ECONNRESET）：可重试
//  - AbortError（超时）：不可重试（每次都用相同 timeout，重试只会让用户白等）
//  - 4xx：不可重试（客户端错误，重试无意义）
function isRetryable(error) {
  if (error?.name === "AbortError") return false;
  if (error instanceof CliError) {
    return typeof error.status === "number" && error.status >= 500 && error.status < 600;
  }
  // 原生网络异常（fetch 抛出的 TypeError 等）
  return true;
}

// 统一 API 请求入口。
export async function apiRequest(path, { method = "GET", query, body, config }) {
  const token = await getToken(config);
  const url = new URL(path, `${config.apiBaseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let lastError;
  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    try {
      const hasBody = body !== undefined || method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
      const response = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
          },
          ...(hasBody ? { body: JSON.stringify(body ?? {}) } : {}),
        },
        config.timeoutMs,
      );

      // 先读文本，再尝试解析；解析失败时仍保留 HTTP 状态用于诊断。
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        throw new CliError("API returned an invalid JSON response.", 1, { status: response.status });
      }

      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new CliError(authErrorMessage(response.status, payload), 1, { status: response.status });
      }

      if (!response.ok) {
        throw new CliError(authErrorMessage(response.status, payload), 1, {
          status: response.status,
          apiCode: payload?.error?.code,
        });
      }

      return parseApiPayload(payload, response.status);
    } catch (error) {
      lastError = error;
      // 不可重试，或已用尽重试次数：立即终止
      if (!isRetryable(error) || attempt === config.retries) break;
      // 指数退避，上限 2s
      await delay(Math.min(250 * 2 ** attempt, 2_000));
    }
  }

  if (lastError?.name === "AbortError") {
    throw new CliError(`API request timed out after ${config.timeoutMs}ms.`);
  }
  throw lastError;
}
