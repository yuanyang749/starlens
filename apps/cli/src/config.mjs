// 全局常量与默认值
import { join } from "node:path";
import { homedir } from "node:os";

// API 默认地址（本地开发环境）
export const DEFAULT_API_BASE_URL = "http://localhost:3000";
// AI 问答链路可能比搜索更慢，但默认仍保持在 30 秒，避免 CLI 长时间无响应。
export const DEFAULT_TIMEOUT_MS = 30 * 1000;
// 最小允许的超时时间：低于此值几乎必然超时，无意义
export const MIN_TIMEOUT_MS = 1_000;
export const DEFAULT_RETRIES = 1;
export const DEFAULT_PAGE_SIZE = 20;

// 托管 MCP 服务地址
export const HOSTED_MCP_BASE_URL = "https://starlens.520ai.xin";

// CLI 版本缓存
export let cachedCliVersion;

export function setCachedCliVersion(v) {
  cachedCliVersion = v;
}

// 默认 token 存储路径：~/.config/starlens/token
export function defaultTokenPath() {
  return join(homedir(), ".config", "starlens", "token");
}

// agent.env 路径（供 install-skill 与 token 复用读取）
export function agentEnvPath() {
  return join(homedir(), ".starlens", "agent.env");
}

export function agentEnvDir() {
  return join(homedir(), ".starlens");
}
