// Token 管理：CLI token 文件读写、stdin 读取、agent.env 复用读取
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CliError } from "./errors.mjs";
import { agentEnvPath, cliConfigPath } from "./config.mjs";

// 从 token 文件读取 bearer token。
export async function readToken(tokenPath) {
  try {
    const token = (await readFile(tokenPath, "utf8")).trim();
    if (!token) throw new CliError(`No token found at ${tokenPath}. Run: stars login --token <token>`);
    return token;
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error?.code === "ENOENT") {
      throw new CliError(`No token found at ${tokenPath}. Run: stars login --token <token>`);
    }
    throw error;
  }
}

// 仅判断 token 是否存在，不抛错。
export async function hasToken(tokenPath) {
  try {
    const token = (await readFile(tokenPath, "utf8")).trim();
    return Boolean(token);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

// 写入 token 文件，权限 0o600。
export async function saveToken(tokenPath, token) {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token.trim()}\n`, { mode: 0o600 });
}

export async function deleteToken(tokenPath) {
  await rm(tokenPath, { force: true });
}

// 从 stdin 读取全部输入（用于 --token-stdin）。
// 修复：在交互式 TTY 下直接报错，避免永久挂起。
export async function readStdin() {
  if (process.stdin.isTTY) {
    throw new CliError("--token-stdin requires piped input. Usage: echo <token> | stars login --token-stdin");
  }
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim();
}

// 从 ~/.starlens/agent.env 读取已存的 token，供 setup/install-mcp 向导复用。
// 修复：兼容单引号 / 无引号 / 双引号三种写法。
export async function readExistingToken() {
  const envPath = agentEnvPath();
  let content;
  try {
    content = await readFile(envPath, "utf8");
  } catch {
    return null;
  }
  // 匹配 export STARLENS_TOKEN="..." / '...' / ...
  const match = content.match(/^export\s+STARLENS_TOKEN=(?:"([^"]*)"|'([^']*)'|([^\s#]+))/m);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

// 写入 ~/.starlens/agent.env（含 token 与 apiBaseUrl），权限 0o600。
export async function writeAgentEnv({ token, apiBaseUrl }) {
  const { agentEnvDir } = await import("./config.mjs");
  const dir = agentEnvDir();
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o700);
  const envPath = agentEnvPath();
  const envContent = [
    `export STARLENS_TOKEN="${token}"`,
    `export STARLENS_API_BASE_URL="${apiBaseUrl}"`,
    "",
  ].join("\n");
  await writeFile(envPath, envContent, { mode: 0o600 });
  return envPath;
}

export async function agentEnvExists() {
  try {
    await access(agentEnvPath());
    return true;
  } catch {
    return false;
  }
}

// 写入 CLI 配置文件（~/.config/starlens/config.json），持久化 setup/install-mcp 选择的 apiBaseUrl，
// 让 ask/search/sync 等命令自动使用同一服务地址，无需每次传 --api-base-url。
export async function saveCliConfig(updates) {
  const path = cliConfigPath();
  let existing = {};
  try {
    existing = JSON.parse(await readFile(path, "utf8"));
  } catch {
    /* 文件不存在或格式错误则从空对象开始 */
  }
  const merged = { ...existing, ...updates };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  return path;
}
