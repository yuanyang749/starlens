// 全局常量与默认值
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";

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

// CLI 配置文件路径：~/.config/starlens/config.json
// install-skill 写入 { apiBaseUrl }，parseGlobalOptions 读取作为回退默认值，
// 让 ask/search/sync 等命令自动使用 install-skill 配置的服务地址。
export function cliConfigPath() {
  return join(homedir(), ".config", "starlens", "config.json");
}

// 同步读取 CLI 配置文件（parseGlobalOptions 是同步的，只能用 readFileSync）。
// 文件不存在或格式非法时返回空对象，不抛错。
export function readCliConfig() {
  try {
    return JSON.parse(readFileSync(cliConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

// agent.env 路径（供 install-skill 与 token 复用读取）
export function agentEnvPath() {
  return join(homedir(), ".starlens", "agent.env");
}

export function agentEnvDir() {
  return join(homedir(), ".starlens");
}
