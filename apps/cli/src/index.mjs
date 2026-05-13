#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
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
  "  stars login --token <token> [--token-path <path>] [--format table|json]",
  "  stars sync [--api-base-url <url>] [--token-path <path>] [--timeout-ms <ms>] [--retries <n>] [--format table|json]",
  "  stars search <query> [--api-base-url <url>] [--token-path <path>] [--page <n>] [--page-size <n>] [--sort relevance|recent|stars|updated] [--language <value>] [--owner <value>] [--tag <value>] [--favorite true|false] [--format table|json]",
  "  stars show <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars open <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--print]",
  "  stars ask <question> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
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

async function saveToken(tokenPath, token) {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token.trim()}\n`, { mode: 0o600 });
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
    const { value: token, rest } = readOption(args.slice(1), "--token");
    if (!token) throw new CliError("login requires --token <token>.");
    if (rest.length > 0) throw new CliError(`Unknown login arguments: ${rest.join(" ")}`);
    await saveToken(config.tokenPath, token);
    renderLogin({ tokenPath: config.tokenPath }, config.format);
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

  throw new CliError(`Unknown command: ${command}\n\n${helpText}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof CliError ? error.message : error.stack || error.message);
    process.exitCode = error.exitCode ?? 1;
  });
}
