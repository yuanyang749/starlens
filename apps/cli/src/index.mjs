#!/usr/bin/env node

import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";

const DEFAULT_API_BASE_URL = "http://localhost:3000";
// AI 问答链路可能比搜索更慢，但默认仍保持在 30 秒，避免 CLI 长时间无响应。
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_RETRIES = 1;
const DEFAULT_PAGE_SIZE = 20;
let cachedCliVersion;

const helpText = [
  "Starlens CLI",
  "",
  "Usage:",
  "  stars login (--token <token>|--token-stdin) [--token-path <path>] [--format table|json]",
  "  stars logout [--token-path <path>] [--format table|json]",
  "  stars status [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars sync [--api-base-url <url>] [--token-path <path>] [--timeout-ms <ms>] [--retries <n>] [--format table|json]",
  "  stars search <query> [--api-base-url <url>] [--token-path <path>] [--page <n>] [--page-size <n>] [--sort relevance|recent|stars|updated] [--language <value>] [--owner <value>] [--tag <value>] [--favorite true|false] [--format table|json]",
  "  stars show <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars open <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--print]",
  "  stars ask <question> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars favorite <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars unfavorite <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars note <repo-id|owner/repo> (--set <text>|--clear) [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars tag add <repo-id|owner/repo> <tag> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars tag remove <repo-id|owner/repo> <tag> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars install-skill [--api-base-url <url>] [--token <token>] [--client claude,cursor,...]  (多客户端逗号分隔)",
  "  stars version",
  "",
  "Configuration:",
  "  --api-base-url, STARLENS_API_BASE_URL   API base URL (default: http://localhost:3000)",
  "  --token-path, STARLENS_TOKEN_PATH       Bearer token storage path (default: ~/.config/starlens/token)",
  "  --timeout-ms, STARLENS_TIMEOUT_MS       API request timeout in milliseconds (default: 30000)",
  "  --retries, STARLENS_RETRIES             Retry count for transient API failures (default: 1)",
  "  --format, STARLENS_FORMAT               Output format: table or json (default: table)",
].join("\n");

class CliError extends Error {
  constructor(message, exitCode = 1, details = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    Object.assign(this, details);
  }
}

function defaultTokenPath() {
  return join(homedir(), ".config", "starlens", "token");
}

function parseNumber(value, fallback, name, { min = 0 } = {}) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min) {
    throw new CliError(`${name} must be an integer greater than or equal to ${min}.`);
  }
  return number;
}

function readOption(args, name) {
  const values = [];
  const rest = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`${name} requires a value.`);
      }
      values.push(value);
      index += 1;
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    } else {
      rest.push(arg);
    }
  }

  return { value: values.at(-1), rest };
}

function readFlag(args, name) {
  let found = false;
  const rest = [];

  for (const arg of args) {
    if (arg === name) {
      found = true;
    } else if (arg.startsWith(`${name}=`)) {
      throw new CliError(`${name} does not take a value.`);
    } else {
      rest.push(arg);
    }
  }

  return { found, rest };
}

function parseGlobalOptions(args, env = process.env) {
  let rest = [...args];
  const option = (name) => {
    const parsed = readOption(rest, name);
    rest = parsed.rest;
    return parsed.value;
  };

  const format = option("--format") ?? env.STARLENS_FORMAT ?? "table";
  if (!["table", "json"].includes(format)) {
    throw new CliError("--format must be either table or json.");
  }

  const apiBaseUrl = (option("--api-base-url") ?? env.STARLENS_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const tokenPath = option("--token-path") ?? env.STARLENS_TOKEN_PATH ?? defaultTokenPath();
  const timeoutMs = parseNumber(option("--timeout-ms") ?? env.STARLENS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "--timeout-ms", { min: 1 });
  const retries = parseNumber(option("--retries") ?? env.STARLENS_RETRIES, DEFAULT_RETRIES, "--retries", { min: 0 });

  return {
    args: rest,
    config: {
      apiBaseUrl,
      tokenPath,
      timeoutMs,
      retries,
      format,
    },
  };
}

async function readToken(tokenPath) {
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

async function hasToken(tokenPath) {
  try {
    const token = (await readFile(tokenPath, "utf8")).trim();
    return Boolean(token);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function saveToken(tokenPath, token) {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token.trim()}\n`, { mode: 0o600 });
}

async function deleteToken(tokenPath) {
  await rm(tokenPath, { force: true });
}

async function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim();
}

async function getCliVersion() {
  if (cachedCliVersion) {
    return cachedCliVersion;
  }

  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  cachedCliVersion = packageJson.version ?? "0.0.0";
  return cachedCliVersion;
}

function parseApiPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new CliError("API returned an invalid JSON response.");
  }
  if (payload.ok === true) return payload.data;
  const message = payload.error?.message ?? "API request failed.";
  throw new CliError(message);
}

function authErrorMessage(status, payload) {
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

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function apiRequest(path, { method = "GET", query, body, config }) {
  const token = await readToken(config.tokenPath);
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
      const hasBody = body !== undefined || method === "POST" || method === "PATCH";
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

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        throw new CliError("API returned an invalid JSON response.");
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

      return parseApiPayload(payload);
    } catch (error) {
      lastError = error;
      const canRetry = !(error instanceof CliError) || /^API request failed with status 5\d\d\./.test(error.message);
      if (!canRetry || attempt === config.retries) break;
      await delay(Math.min(250 * 2 ** attempt, 2_000));
    }
  }

  if (lastError?.name === "AbortError") {
    throw new CliError(`API request timed out after ${config.timeoutMs}ms.`);
  }
  throw lastError;
}

function outputJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function truncate(value, width) {
  const text = String(value ?? "");
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
}

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log("No results.");
    return;
  }

  const widths = columns.map((column) =>
    Math.min(
      column.maxWidth ?? 32,
      Math.max(column.label.length, ...rows.map((row) => String(row[column.key] ?? "").length)),
    ),
  );
  const line = (row) =>
    columns
      .map((column, index) => truncate(row[column.key] ?? "", widths[index]).padEnd(widths[index]))
      .join("  ")
      .trimEnd();

  console.log(line(Object.fromEntries(columns.map((column) => [column.key, column.label]))));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(row));
}

function renderLogin({ tokenPath }, format) {
  const data = { status: "logged_in", tokenPath };
  if (format === "json") return outputJson(data);
  console.log(`Logged in. Token saved to ${tokenPath}`);
}

function renderLogout({ tokenPath }, format) {
  const data = { status: "logged_out", tokenPath };
  if (format === "json") return outputJson(data);
  console.log(`Logged out. Token removed from ${tokenPath}`);
}

function renderStatus(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    [
      { field: "API base URL", value: data.apiBaseUrl },
      { field: "Token path", value: data.tokenPath },
      { field: "Token configured", value: data.tokenConfigured ? "yes" : "no" },
    ],
    [
      { key: "field", label: "Field", maxWidth: 24 },
      { key: "value", label: "Value", maxWidth: 96 },
    ],
  );
}

function renderSync(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    [
      {
        status: data.status ?? "started",
        startedAt: data.startedAt ?? "",
        finishedAt: data.finishedAt ?? "",
        fetched: data.counts?.fetched ?? "",
        insertedOrUpdated: data.counts?.insertedOrUpdated ?? "",
        unstarred: data.counts?.unstarred ?? "",
      },
    ],
    [
      { key: "status", label: "Status" },
      { key: "startedAt", label: "Started", maxWidth: 28 },
      { key: "finishedAt", label: "Finished", maxWidth: 28 },
      { key: "fetched", label: "Fetched" },
      { key: "insertedOrUpdated", label: "Upserted" },
      { key: "unstarred", label: "Unstarred" },
    ],
  );
}

function renderSearch(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    (data.items ?? []).map((repo) => ({
      fullName: repo.fullName,
      language: repo.language ?? "",
      stars: repo.stargazersCount ?? 0,
      favorite: repo.isFavorite ? "yes" : "no",
      tags: (repo.tags ?? []).join(","),
      summary: repo.repoSummary || repo.description || "",
    })),
    [
      { key: "fullName", label: "Repository", maxWidth: 32 },
      { key: "language", label: "Language", maxWidth: 16 },
      { key: "stars", label: "Stars", maxWidth: 10 },
      { key: "favorite", label: "Favorite", maxWidth: 10 },
      { key: "tags", label: "Tags", maxWidth: 20 },
      { key: "summary", label: "Summary", maxWidth: 56 },
    ],
  );
  console.log(`\nPage ${data.page ?? 1} · ${data.total ?? 0} total · hasMore=${Boolean(data.hasMore)}`);
}

function renderRepo(repo, format) {
  if (format === "json") return outputJson(repo);
  printTable(
    [
      { field: "Repository", value: repo.fullName ?? "" },
      { field: "Language", value: repo.language ?? "" },
      { field: "Stars", value: repo.stargazersCount ?? 0 },
      { field: "Favorite", value: repo.isFavorite ? "yes" : "no" },
      { field: "Tags", value: (repo.tags ?? []).join(", ") },
      { field: "Summary", value: repo.repoSummary || repo.description || "" },
      { field: "Note", value: repo.note ?? "" },
      { field: "URL", value: repo.htmlUrl ?? "" },
    ],
    [
      { key: "field", label: "Field", maxWidth: 16 },
      { key: "value", label: "Value", maxWidth: 96 },
    ],
  );
}

function renderAsk(data, format) {
  if (format === "json") return outputJson(data);
  console.log(data.answer ?? "No answer.");
  const candidates = data.candidates ?? data.matches ?? [];
  if (candidates.length > 0) {
    console.log("");
    const hasReason = candidates.some((item) => typeof item.reason === "string" && item.reason.trim() !== "");
    const rows = candidates.map((item) => ({
      repo: item.fullName ?? item.repoId ?? item.id ?? "",
      reason: item.reason ?? "",
    }));
    const columns = hasReason
      ? [
          { key: "repo", label: "Repository", maxWidth: 48 },
          { key: "reason", label: "Reason", maxWidth: 72 },
        ]
      : [{ key: "repo", label: "Repository", maxWidth: 48 }];
    printTable(rows, columns);
  }
}

function renderTags(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    (data.tags ?? []).map((tag) => ({ tag })),
    [{ key: "tag", label: "Tag", maxWidth: 48 }],
  );
}

function searchOptions(args) {
  let rest = [...args];
  const option = (name) => {
    const parsed = readOption(rest, name);
    rest = parsed.rest;
    return parsed.value;
  };
  return {
    args: rest,
    query: {
      page: option("--page"),
      pageSize: option("--page-size") ?? DEFAULT_PAGE_SIZE,
      sort: option("--sort"),
      language: option("--language"),
      owner: option("--owner"),
      tag: option("--tag"),
      favorite: option("--favorite"),
    },
  };
}

async function resolveRepo(repoOrId, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}`, { config });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const result = await apiRequest("/api/search", {
    config,
    query: { q: repoOrId, page: 1, pageSize: 10, sort: "relevance" },
  });
  const normalized = repoOrId.toLowerCase();
  const exact = (result.items ?? []).find((repo) => repo.fullName?.toLowerCase() === normalized || repo.id === repoOrId);
  const fallback = exact ?? (result.items?.length === 1 ? result.items[0] : null);

  if (!fallback) {
    throw new CliError(`Repository was not found: ${repoOrId}`);
  }

  return fallback;
}

async function patchRepoCuration(repoOrId, updates, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}`, {
      method: "PATCH",
      body: updates,
      config,
    });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await resolveRepo(repoOrId, config);
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}`, {
    method: "PATCH",
    body: updates,
    config,
  });
}

async function addTag(repoOrId, tag, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}/tags`, {
      method: "POST",
      body: { tag },
      config,
    });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await resolveRepo(repoOrId, config);
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}/tags`, {
    method: "POST",
    body: { tag },
    config,
  });
}

async function removeTag(repoOrId, tag, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}/tags/${encodeURIComponent(tag)}`, {
      method: "DELETE",
      config,
    });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await resolveRepo(repoOrId, config);
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}/tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
    config,
  });
}

function openUrl(url) {
  const commands = {
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
    linux: ["xdg-open", [url]],
  };
  const [command, args] = commands[process.platform] ?? commands.linux;

  return new Promise((resolveOpen, rejectOpen) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => rejectOpen(new CliError(`Could not open URL automatically. Open it manually: ${url}`)));
    child.on("close", (code) => {
      if (code && code !== 0) {
        rejectOpen(new CliError(`Could not open URL automatically. Open it manually: ${url}`));
        return;
      }
      resolveOpen();
    });
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { args, config } = parseGlobalOptions(argv, env);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(helpText);
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(await getCliVersion());
    return;
  }

  if (command === "login") {
    const tokenOption = readOption(args.slice(1), "--token");
    const stdinOption = readFlag(tokenOption.rest, "--token-stdin");
    if (tokenOption.value && stdinOption.found) {
      throw new CliError("login accepts either --token <token> or --token-stdin, not both.");
    }
    const token = tokenOption.value ?? (stdinOption.found ? await readStdin() : "");
    if (!token) throw new CliError("login requires --token <token> or --token-stdin.");
    if (stdinOption.rest.length > 0) throw new CliError(`Unknown login arguments: ${stdinOption.rest.join(" ")}`);
    await saveToken(config.tokenPath, token);
    renderLogin({ tokenPath: config.tokenPath }, config.format);
    return;
  }

  if (command === "logout") {
    if (args.length > 1) throw new CliError(`Unknown logout arguments: ${args.slice(1).join(" ")}`);
    await deleteToken(config.tokenPath);
    renderLogout({ tokenPath: config.tokenPath }, config.format);
    return;
  }

  if (command === "status") {
    if (args.length > 1) throw new CliError(`Unknown status arguments: ${args.slice(1).join(" ")}`);
    renderStatus({
      apiBaseUrl: config.apiBaseUrl,
      tokenPath: config.tokenPath,
      tokenConfigured: await hasToken(config.tokenPath),
    }, config.format);
    return;
  }

  if (command === "sync") {
    if (args.length > 1) throw new CliError(`Unknown sync arguments: ${args.slice(1).join(" ")}`);
    renderSync(await apiRequest("/api/sync", { method: "POST", config }), config.format);
    return;
  }

  if (command === "search") {
    const parsed = searchOptions(args.slice(1));
    const queryText = parsed.args.join(" ").trim();
    if (!queryText) throw new CliError("search requires a query.");
    renderSearch(await apiRequest("/api/search", { config, query: { ...parsed.query, q: queryText } }), config.format);
    return;
  }

  if (command === "show") {
    const repoOrId = args.slice(1).join(" ").trim();
    if (!repoOrId) throw new CliError("show requires a repository id or owner/repo.");
    renderRepo(await resolveRepo(repoOrId, config), config.format);
    return;
  }

  if (command === "open") {
    const { found: printOnly, rest } = readFlag(args.slice(1), "--print");
    const repoOrId = rest.join(" ").trim();
    if (!repoOrId) throw new CliError("open requires a repository id or owner/repo.");
    const repo = await resolveRepo(repoOrId, config);
    if (!repo.htmlUrl) throw new CliError(`Repository has no URL: ${repo.fullName ?? repoOrId}`);
    console.log(repo.htmlUrl);
    if (!printOnly) {
      await openUrl(repo.htmlUrl);
    }
    return;
  }

  if (command === "ask") {
    const question = args.slice(1).join(" ").trim();
    if (!question) throw new CliError("ask requires a question.");
    renderAsk(await apiRequest("/api/ai/ask", { method: "POST", config, body: { question } }), config.format);
    return;
  }

  if (command === "favorite" || command === "unfavorite") {
    const repoOrId = args.slice(1).join(" ").trim();
    if (!repoOrId) throw new CliError(`${command} requires a repository id or owner/repo.`);
    renderRepo(
      await patchRepoCuration(repoOrId, { isFavorite: command === "favorite" }, config),
      config.format,
    );
    return;
  }

  if (command === "note") {
    let rest = args.slice(1);
    const setOption = readOption(rest, "--set");
    rest = setOption.rest;
    const clearOption = readFlag(rest, "--clear");
    rest = clearOption.rest;
    if (setOption.value !== undefined && clearOption.found) {
      throw new CliError("note accepts either --set <text> or --clear, not both.");
    }
    if (setOption.value === undefined && !clearOption.found) {
      throw new CliError("note requires --set <text> or --clear.");
    }
    const repoOrId = rest.join(" ").trim();
    if (!repoOrId) throw new CliError("note requires a repository id or owner/repo.");
    renderRepo(
      await patchRepoCuration(repoOrId, { note: clearOption.found ? "" : setOption.value }, config),
      config.format,
    );
    return;
  }

  if (command === "tag") {
    const action = args[1];
    if (!["add", "remove"].includes(action)) {
      throw new CliError("tag requires add or remove.");
    }
    const tag = args.at(-1)?.trim();
    const repoOrId = args.slice(2, -1).join(" ").trim();
    if (!repoOrId || !tag) {
      throw new CliError(`tag ${action} requires a repository id or owner/repo and a tag.`);
    }
    const data = action === "add"
      ? await addTag(repoOrId, tag, config)
      : await removeTag(repoOrId, tag, config);
    renderTags(data, config.format);
    return;
  }

  if (command === "install-skill" || command === "setup") {
    await runInstallSkillWizard(args.slice(1), env);
    return;
  }

  throw new CliError(`Unknown command: ${command}\n\n${helpText}`);
}

// ── install-skill wizard ──────────────────────────────────────────────────────

function detectProjectRoot() {
  // apps/cli/src/index.mjs → up 3 levels = project root
  return new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
}

// Skill 源目录（npm 包内的 skills/ 目录）
function getSkillSourceDir() {
  // src/index.mjs → ../skills/starlens = cli/skills/starlens
  return new URL("../skills/starlens", import.meta.url).pathname;
}

// 各客户端全局 skill 目标路径
const SKILL_TARGETS = {
  claude:    { path: join(homedir(), ".claude", "skills", "starlens"),    label: "Claude Code" },
  opencode:  { path: join(homedir(), ".opencode", "skills", "starlens"),  label: "OpenCode" },
  codex:     { path: join(homedir(), ".codex", "skills", "starlens"),     label: "Codex CLI" },
  openclaw:  { path: join(homedir(), ".openclaw", "skills", "starlens"),  label: "OpenClaw" },
  hermes:    { path: join(homedir(), ".hermes", "skills", "starlens"),    label: "Hermes" },
};

async function copyDir(src, dest) {
  const { readdir, copyFile } = await import("node:fs/promises");
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function installSkillFiles(client, projectPath) {
  const skillSrc = getSkillSourceDir();

  // 检查 skill 源是否存在（全局安装时应该存在）
  try {
    await access(skillSrc);
  } catch {
    return { ok: false, reason: "skill 文件未找到（可能是旧版本，请更新：npm i -g @starlens-app/cli）" };
  }

  const results = [];

  // 1. 全局路径（对应当前客户端）
  const globalTarget = SKILL_TARGETS[client];
  if (globalTarget) {
    try {
      await copyDir(skillSrc, globalTarget.path);
      results.push({ path: globalTarget.path, ok: true });
    } catch (e) {
      results.push({ path: globalTarget.path, ok: false, reason: e.message });
    }
  }

  // 2. Cursor 项目级：.cursor/rules/starlens.mdc
  if (client === "cursor" && projectPath) {
    const cursorRulesDir = join(projectPath, ".cursor", "rules");
    const cursorTarget = join(cursorRulesDir, "starlens.mdc");
    try {
      await mkdir(cursorRulesDir, { recursive: true });
      const skillContent = await readFile(join(skillSrc, "SKILL.md"), "utf8");
      // 转换 SKILL.md → .mdc（保持内容不变，Cursor 兼容 markdown frontmatter）
      await writeFile(cursorTarget, skillContent);
      results.push({ path: cursorTarget, ok: true });
    } catch (e) {
      results.push({ path: cursorTarget, ok: false, reason: e.message });
    }
  }

  // 3. VS Code 项目级：.github/copilot-instructions.md（追加）
  if (client === "vscode" && projectPath) {
    const githubDir = join(projectPath, ".github");
    const vscodeTarget = join(githubDir, "copilot-instructions.md");
    try {
      await mkdir(githubDir, { recursive: true });
      const skillContent = await readFile(join(skillSrc, "SKILL.md"), "utf8");
      // 去掉 frontmatter，只保留正文
      const body = skillContent.replace(/^---[\s\S]*?---\n/, "").trim();
      let existing = "";
      try { existing = await readFile(vscodeTarget, "utf8"); } catch { /* 不存在则新建 */ }
      const marker = "<!-- starlens-skill -->";
      if (!existing.includes(marker)) {
        await writeFile(vscodeTarget, existing + (existing ? "\n\n" : "") + marker + "\n" + body + "\n" + marker);
      }
      results.push({ path: vscodeTarget, ok: true });
    } catch (e) {
      results.push({ path: vscodeTarget, ok: false, reason: e.message });
    }
  }

  return { ok: results.some(r => r.ok), results };
}

function createReadlineInterface() {
  return createInterface({ input: process.stdin, output: process.stdout, terminal: false });
}

async function wizardPrompt(rl, question, defaultValue) {
  const hint = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue || "");
    });
  });
}

async function wizardPromptSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(`${question}: `);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let input = "";

    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");

      const onData = (char) => {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input.trim());
        } else if (char === "") {
          process.stdout.write("\n");
          process.exit(1);
        } else if (char === "" || char === "\b") {
          if (input.length > 0) input = input.slice(0, -1);
        } else {
          input += char;
        }
      };

      stdin.on("data", onData);
    } else {
      // Non-TTY fallback: readline without echo hiding
      const rl = createReadlineInterface();
      rl.question("", (answer) => {
        rl.close();
        process.stdout.write("\n");
        resolve(answer.trim());
      });
    }
  });
}

function maskToken(token) {
  if (!token || token.length < 8) return "***";
  return token.slice(0, 4) + "..." + token.slice(-3);
}

async function readExistingToken() {
  const agentEnvPath = join(homedir(), ".starlens", "agent.env");
  try {
    const content = await readFile(agentEnvPath, "utf8");
    const match = content.match(/^export STARLENS_TOKEN="([^"]+)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function wizardCheckbox(items) {
  const isTTY = typeof process.stdin.setRawMode === "function";

  if (!isTTY) {
    // Non-TTY fallback: comma-separated input
    const labels = items.map((it, i) => `  ${i + 1}) ${it.label}${it.skillOnly ? " [仅 Skill]" : ""}`).join("\n");
    console.log(labels);
    const rl = createReadlineInterface();
    return new Promise((resolve) => {
      rl.question("输入序号（逗号分隔，如 1,2）: ", (answer) => {
        rl.close();
        const selected = answer.trim().split(",").map(s => {
          const n = parseInt(s.trim(), 10);
          return items[n - 1]?.value ?? null;
        }).filter(Boolean);
        resolve(selected.length > 0 ? selected : [items[0].value]);
      });
    });
  }

  return new Promise((resolve) => {
    let cursor = 0;
    const selected = new Set([items[0].value]); // 默认选中第一项

    const RESET = "\x1b[0m";
    const BOLD = "\x1b[1m";
    const CYAN = "\x1b[36m";
    const DIM = "\x1b[2m";

    function render() {
      // 清除之前的输出行
      process.stdout.write("\x1b[" + items.length + "A\x1b[0J");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isActive = i === cursor;
        const isSelected = selected.has(item.value);
        const icon = isSelected ? "◉" : "◯";
        const label = item.label + (item.skillOnly ? `  ${DIM}[仅 Skill]${RESET}` : "");
        const line = isActive
          ? `${BOLD}${CYAN}> ${icon} ${label}${RESET}`
          : `  ${icon} ${label}`;
        process.stdout.write(line + "\n");
      }
    }

    // 初次渲染
    console.log(`请选择 AI 客户端（${BOLD}↑↓${RESET} 移动，${BOLD}空格${RESET} 选中/取消，${BOLD}回车${RESET} 确认）：\n`);
    for (let i = 0; i < items.length; i++) {
      process.stdout.write("\n");
    }
    render();

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk) => {
      if (chunk === "\x1b[A") { // 上箭头
        cursor = (cursor - 1 + items.length) % items.length;
        render();
      } else if (chunk === "\x1b[B") { // 下箭头
        cursor = (cursor + 1) % items.length;
        render();
      } else if (chunk === " ") { // 空格
        const val = items[cursor].value;
        if (selected.has(val)) selected.delete(val);
        else selected.add(val);
        render();
      } else if (chunk === "\r" || chunk === "\n") { // 回车
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        stdin.pause();
        process.stdout.write("\n");
        const result = items.map(it => it.value).filter(v => selected.has(v));
        resolve(result.length > 0 ? result : [items[0].value]);
      } else if (chunk === "\x03") { // Ctrl+C
        stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(1);
      }
    };

    stdin.on("data", onData);
  });
}

function buildMcpArgs(projectRoot) {
  return ["-lc", `source "$HOME/.starlens/agent.env" && cd "${projectRoot}" && corepack pnpm mcp:start`];
}

function renderClaudeCodeSnippet(projectRoot) {
  const mcpJson = JSON.stringify(
    {
      type: "stdio",
      command: "zsh",
      args: buildMcpArgs(projectRoot),
    },
    null,
    2,
  );
  return `claude mcp add-json starlens '${mcpJson}'`;
}

function renderCursorSnippet(projectRoot) {
  return JSON.stringify(
    {
      mcpServers: {
        starlens: {
          command: "corepack",
          args: ["pnpm", "mcp:start"],
          cwd: projectRoot,
          env: {
            STARLENS_TOKEN: "（从 ~/.starlens/agent.env 读取）",
            STARLENS_API_BASE_URL: "（从 ~/.starlens/agent.env 读取）",
          },
        },
      },
    },
    null,
    2,
  );
}

function renderCodexSnippet(projectRoot) {
  return `[mcp_servers.starlens]
type = "stdio"
command = "zsh"
args = ["-lc", "source \\"$HOME/.starlens/agent.env\\" && cd \\"${projectRoot}\\" && corepack pnpm mcp:start"]
startup_timeout_sec = 30
default_tools_approval_mode = "approve"`;
}

function renderOpencodeSnippet(projectRoot) {
  return JSON.stringify(
    {
      mcp: {
        starlens: {
          type: "local",
          command: ["zsh", "-lc", `source "$HOME/.starlens/agent.env" && cd "${projectRoot}" && corepack pnpm mcp:start`],
          enabled: true,
          timeout: 10000,
        },
      },
    },
    null,
    2,
  );
}

async function mergeJson(filePath, mergeFn) {
  let existing = {};
  try {
    const raw = await readFile(filePath, "utf8");
    existing = JSON.parse(raw);
  } catch { /* 文件不存在或格式错误则从空对象开始 */ }
  const merged = mergeFn(existing);
  await mkdir(filePath.replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2) + "\n");
}

async function appendTomlSection(filePath, sectionKey, content) {
  let existing = "";
  try { existing = await readFile(filePath, "utf8"); } catch { /* 新建 */ }
  if (existing.includes(`[${sectionKey}]`)) {
    return { ok: false, reason: `[${sectionKey}] 节点已存在，跳过写入` };
  }
  await mkdir(filePath.replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(filePath, existing + (existing && !existing.endsWith("\n") ? "\n" : "") + "\n" + content + "\n");
  return { ok: true };
}

async function writeMcpConfig(client, { apiBaseUrl, token, projectRoot, hosted }) {
  const home = homedir();
  try {
    if (client === "cursor") {
      const cursorMcpPath = join(home, ".cursor", "mcp.json");
      const starlensEntry = hosted
        ? { url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` } }
        : { command: "corepack", args: ["pnpm", "mcp:start"], cwd: projectRoot, env: { STARLENS_TOKEN: "（从 ~/.starlens/agent.env 读取）", STARLENS_API_BASE_URL: "（从 ~/.starlens/agent.env 读取）" } };
      await mergeJson(cursorMcpPath, (obj) => ({
        ...obj,
        mcpServers: { ...(obj.mcpServers ?? {}), starlens: starlensEntry },
      }));
      return { ok: true, path: cursorMcpPath };
    }

    if (client === "opencode") {
      const opencodePath = join(home, ".config", "opencode", "opencode.json");
      const starlensEntry = hosted
        ? { type: "http", url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` }, enabled: true }
        : { type: "local", command: ["zsh", "-lc", `source "$HOME/.starlens/agent.env" && cd "${projectRoot}" && corepack pnpm mcp:start`], enabled: true, timeout: 10000 };
      await mergeJson(opencodePath, (obj) => ({
        ...obj,
        mcp: { ...(obj.mcp ?? {}), starlens: starlensEntry },
      }));
      return { ok: true, path: opencodePath };
    }

    if (client === "codex") {
      const codexPath = join(home, ".codex", "config.toml");
      const content = hosted
        ? `[mcp_servers.starlens]\ntype = "http"\nurl = "${apiBaseUrl}/mcp"\n\n[mcp_servers.starlens.headers]\nAuthorization = "Bearer ${token || "stl_xxx"}"\nstartup_timeout_sec = 30\ndefault_tools_approval_mode = "approve"`
        : `[mcp_servers.starlens]\ntype = "stdio"\ncommand = "zsh"\nargs = ["-lc", "source \\"$HOME/.starlens/agent.env\\" && cd \\"${projectRoot}\\" && corepack pnpm mcp:start"]\nstartup_timeout_sec = 30\ndefault_tools_approval_mode = "approve"`;
      const result = await appendTomlSection(codexPath, "mcp_servers.starlens", content);
      return result.ok ? { ok: true, path: codexPath } : { ok: false, reason: result.reason };
    }

    return { ok: false, reason: `${client} 不支持自动写入，请手动配置` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function spawnCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

const HOSTED_MCP_BASE_URL = "https://starlens.520ai.xin";

function isHostedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.startsWith("192.168.");
  } catch {
    return false;
  }
}

function renderHostedClaudeSnippet(apiBaseUrl, token) {
  return `claude mcp add-json starlens '${JSON.stringify({
    type: "http",
    url: `${apiBaseUrl}/mcp`,
    headers: { Authorization: `Bearer ${token || "stl_xxx"}` },
  }, null, 2)}'`;
}

function renderHostedCursorSnippet(apiBaseUrl, token) {
  return JSON.stringify(
    {
      mcpServers: {
        starlens: {
          url: `${apiBaseUrl}/mcp`,
          headers: { Authorization: `Bearer ${token || "stl_xxx"}` },
        },
      },
    },
    null,
    2,
  );
}

function renderHostedCodexSnippet(apiBaseUrl, token) {
  return `[mcp_servers.starlens]
type = "http"
url = "${apiBaseUrl}/mcp"

[mcp_servers.starlens.headers]
Authorization = "Bearer ${token || "stl_xxx"}"
startup_timeout_sec = 30
default_tools_approval_mode = "approve"`;
}

function renderHostedOpencodeSnippet(apiBaseUrl, token) {
  return JSON.stringify(
    {
      mcp: {
        starlens: {
          type: "http",
          url: `${apiBaseUrl}/mcp`,
          headers: { Authorization: `Bearer ${token || "stl_xxx"}` },
          enabled: true,
        },
      },
    },
    null,
    2,
  );
}

async function runInstallSkillWizard(args, env) {
  let rest = [...args];

  const apiBaseUrlArg = readOption(rest, "--api-base-url");
  rest = apiBaseUrlArg.rest;
  const tokenArg = readOption(rest, "--token");
  rest = tokenArg.rest;
  const clientArg = readOption(rest, "--client");
  rest = clientArg.rest;

  const clientLabels = {
    claude: "Claude Code", cursor: "Cursor", vscode: "VS Code (Copilot)",
    codex: "Codex CLI", opencode: "OpenCode", openclaw: "OpenClaw", hermes: "Hermes", other: "其他",
  };
  const MCP_SUPPORTED = new Set(["claude", "cursor", "codex", "opencode"]);

  const CLIENT_ITEMS = [
    { value: "claude",   label: "Claude Code" },
    { value: "cursor",   label: "Cursor" },
    { value: "vscode",   label: "VS Code (Copilot)",  skillOnly: true },
    { value: "codex",    label: "Codex CLI" },
    { value: "opencode", label: "OpenCode" },
    { value: "openclaw", label: "OpenClaw",            skillOnly: true },
    { value: "hermes",   label: "Hermes",              skillOnly: true },
    { value: "other",    label: "其他（仅输出配置片段）", skillOnly: true },
  ];

  console.log("");
  console.log("Starlens 安装向导");
  console.log("═".repeat(40));
  console.log("本向导将引导你完成 Skill 安装及可选的 MCP Server 配置。");
  console.log("");

  // Step 0: check global install
  const isGlobalInstall = !process.argv[1]?.includes("apps/cli");
  if (!isGlobalInstall) {
    console.log("提示：你正在从源码运行。如需让其他工具通过 `stars` 命令使用，");
    console.log("      请先全局安装：npm install -g @starlens-app/cli");
    console.log("");
  }

  // rl 在所有 raw-mode 交互结束后再创建，避免 wizardCheckbox 的 \r 泄漏进 readline 缓冲区
  let rl;

  try {
    // Step 1: 多选客户端
    let clients;
    const clientArgRaw = clientArg.value?.toLowerCase();
    if (clientArgRaw) {
      // --client 参数：逗号分隔
      const nameMap = Object.fromEntries(CLIENT_ITEMS.map(it => [it.value, it.value]));
      clients = clientArgRaw.split(",").map(s => nameMap[s.trim()]).filter(Boolean);
      if (clients.length === 0) clients = ["claude"];
      console.log(`已选择客户端：${clients.map(c => clientLabels[c]).join("、")}`);
    } else {
      console.log("");
      clients = await wizardCheckbox(CLIENT_ITEMS);
      console.log(`已选择：${clients.map(c => clientLabels[c]).join("、")}`);
    }

    // wizardCheckbox（raw mode）完成后再创建 readline，避免 Enter 残留字符被提前消费
    rl = createReadlineInterface();

    const cwd = process.cwd();

    // Step 2: 安装 Skill（默认是）
    console.log("");
    console.log("─".repeat(40));
    const installSkill = await wizardPrompt(rl, "是否安装 Starlens Skill 文件？(Y/n)", "Y");
    if (!/^n$/i.test(installSkill)) {
      console.log("");
      console.log("安装 Starlens Agent Skill...");
      for (const client of clients) {
        const skillResult = await installSkillFiles(client, cwd);
        if (skillResult.results) {
          for (const r of skillResult.results) {
            if (r.ok) {
              console.log(`✓ Skill 已安装：${r.path}`);
            } else {
              console.log(`⚠  Skill 安装失败：${r.path}（${r.reason}）`);
            }
          }
        } else if (!skillResult.ok) {
          console.log(`⚠  ${clientLabels[client]}：${skillResult.reason}`);
        }
      }
    } else {
      console.log("跳过 Skill 安装。");
    }

    // Step 3: 配置 MCP（可选，默认否）
    console.log("");
    console.log("─".repeat(40));
    const mcpClients = clients.filter(c => MCP_SUPPORTED.has(c));
    let token = tokenArg.value ?? "";
    let apiBaseUrl = "";

    if (mcpClients.length === 0) {
      console.log("所选客户端均不支持 MCP，跳过 MCP 配置。");
    } else {
      const doMcp = await wizardPrompt(rl, `是否配置 MCP Server？（支持：${mcpClients.map(c => clientLabels[c]).join("、")}）(y/N)`, "N");
      if (/^y$/i.test(doMcp)) {
        // 部署模式
        console.log("");
        const defaultUrl = apiBaseUrlArg.value ?? env.STARLENS_API_BASE_URL ?? HOSTED_MCP_BASE_URL;
        console.log("部署模式：");
        console.log("  1) 托管服务（推荐）— 使用 starlens.520ai.xin，无需本地启动服务");
        console.log("  2) 自部署 — 使用你自己的服务器或本地开发环境");
        const modeChoice = await wizardPrompt(rl, "选择模式", "1");
        const isSelfHosted = modeChoice.trim() === "2";

        let projectRoot;
        if (isSelfHosted) {
          console.log("");
          apiBaseUrl = (await wizardPrompt(rl, "Starlens API base URL", defaultUrl === HOSTED_MCP_BASE_URL ? DEFAULT_API_BASE_URL : defaultUrl)).replace(/\/+$/, "");
          if (!isHostedUrl(apiBaseUrl)) {
            const detectedRoot = detectProjectRoot();
            console.log(`检测到项目根目录：${detectedRoot}`);
            projectRoot = (await wizardPrompt(rl, "项目路径（回车确认）", detectedRoot)).replace(/\/$/, "");
          }
        } else {
          apiBaseUrl = HOSTED_MCP_BASE_URL;
          console.log(`✓ 使用托管服务：${HOSTED_MCP_BASE_URL}`);
        }

        const hosted = isHostedUrl(apiBaseUrl);

        // Token（支持历史复用，脱敏展示）
        console.log("");
        console.log("在 Starlens 设置页创建 API Token（stl_xxx），然后粘贴到这里。");
        if (!token) {
          const existingToken = await readExistingToken();
          const tokenHint = existingToken ? `回车复用已有 token: ${maskToken(existingToken)}，或输入新值` : "输入不可见";
          const inputToken = await wizardPromptSecret(`API Token（${tokenHint}）`);
          token = inputToken || existingToken || "";
        }
        if (!token) {
          console.log("⚠  未输入 Token，配置片段中将显示占位符 stl_xxx，请事后手动替换。");
        }

        // 写入 agent.env（自部署非托管模式）
        if (!hosted && token) {
          const agentEnvDir = join(homedir(), ".starlens");
          const agentEnvPath = join(agentEnvDir, "agent.env");
          let envExists = false;
          try { await access(agentEnvPath); envExists = true; } catch { /* 不存在 */ }

          let skipEnvWrite = false;
          if (envExists) {
            console.log("");
            const overwrite = await wizardPrompt(rl, "~/.starlens/agent.env 已存在，是否覆盖？(y/N)", "N");
            skipEnvWrite = !/^y$/i.test(overwrite);
          }

          if (!skipEnvWrite) {
            await mkdir(agentEnvDir, { recursive: true });
            await chmod(agentEnvDir, 0o700);
            const envContent = [`export STARLENS_TOKEN="${token}"`, `export STARLENS_API_BASE_URL="${apiBaseUrl}"`, ""].join("\n");
            await writeFile(agentEnvPath, envContent, { mode: 0o600 });
            console.log(`✓ 已写入 ${agentEnvPath}`);
          } else {
            console.log("跳过写入 agent.env。");
          }
        }

        // 对每个支持 MCP 的客户端自动写入配置
        console.log("");
        console.log("─".repeat(40));
        console.log("配置 MCP Server...");
        for (const client of mcpClients) {
          if (client === "claude") {
            const mcpJson = hosted
              ? JSON.stringify({ type: "http", url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` } })
              : JSON.stringify({ type: "stdio", command: "zsh", args: buildMcpArgs(projectRoot) });
            console.log(`\n  ${clientLabels.claude} 配置命令：`);
            console.log(`  claude mcp add-json starlens '${mcpJson}'`);
            console.log("");
            const autoRun = await wizardPrompt(rl, "  是否立即执行？(y/N)", "N");
            if (/^y$/i.test(autoRun)) {
              const ok = await spawnCommand("claude", ["mcp", "add-json", "starlens", mcpJson]);
              console.log(ok ? "  ✓ MCP server 已注册到 Claude Code。" : "  ✗ 注册失败，请手动执行上方命令。");
            }
          } else {
            const result = await writeMcpConfig(client, { apiBaseUrl, token, projectRoot, hosted });
            if (result.ok) {
              console.log(`✓ MCP 配置已写入：${result.path}`);
            } else {
              console.log(`⚠  ${clientLabels[client]}：${result.reason}`);
            }
          }
        }

        // 验证 Token（可选）
        if (token) {
          console.log("");
          const doVerify = await wizardPrompt(rl, "是否验证 Token 可用性？(y/N)", "N");
          if (/^y$/i.test(doVerify)) {
            console.log("验证中...");
            try {
              const res = await fetchWithTimeout(
                `${apiBaseUrl}/api/search?q=test&pageSize=1`,
                { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
                8_000,
              );
              if (res.ok) {
                console.log("✓ Token 验证成功，API 连接正常。");
              } else if (res.status === 401 || res.status === 403) {
                console.log(`✗ Token 无效（HTTP ${res.status}）。请检查 Token 是否正确。`);
              } else {
                console.log(`⚠  服务器返回 HTTP ${res.status}，请检查 API base URL 是否正确。`);
              }
            } catch {
              console.log(`✗ 无法连接到 ${apiBaseUrl}，请检查服务是否启动。`);
            }
          }
        }
      } else {
        console.log("跳过 MCP 配置。");
      }
    }

    // 完成
    console.log("");
    console.log("─".repeat(40));
    console.log("✓ 配置完成！");
    console.log("");
    console.log("下一步：");
    console.log("  1. 重启你的 AI 客户端，使配置生效。");
    console.log("  2. 在客户端中输入「搜索我收藏的关于 React 的仓库」测试是否可用。");
    console.log(`  3. 完整文档：${HOSTED_MCP_BASE_URL}/docs/integrations`);
    console.log("");
  } finally {
    rl?.close();
  }
}

import { realpathSync } from "node:fs";
const _realArgv1 = (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })();
if (import.meta.url === `file://${_realArgv1}`) {
  main().catch((error) => {
    console.error(error instanceof CliError ? error.message : error.stack || error.message);
    process.exitCode = error.exitCode ?? 1;
  });
}
