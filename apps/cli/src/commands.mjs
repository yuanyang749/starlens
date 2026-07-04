// 各子命令处理器
import { CliError } from "./errors.mjs";
import { readOption, readFlag, searchOptions } from "./args.mjs";
import { readStdin, saveToken, deleteToken, hasToken } from "./token.mjs";
import { apiRequest } from "./api.mjs";
import { startSpinner, stopSpinner } from "./output.mjs";
import {
  renderLogin,
  renderLogout,
  renderStatus,
  renderSync,
  renderSearch,
  renderRepo,
  renderAsk,
  renderTags,
  renderSuggest,
  renderAnalyze,
} from "./renderers.mjs";
import { resolveRepo, patchRepoCuration, addTag, removeTag, openUrl } from "./repo.mjs";

// stars login (--token <token>|--token-stdin) [--token-path <path>]
export async function loginCommand(args, config) {
  const tokenOption = readOption(args, "--token");
  const stdinOption = readFlag(tokenOption.rest, "--token-stdin");
  if (tokenOption.value && stdinOption.found) {
    throw new CliError("login accepts either --token <token> or --token-stdin, not both.");
  }
  const token = tokenOption.value ?? (stdinOption.found ? await readStdin() : "");
  if (!token) throw new CliError("login requires --token <token> or --token-stdin.");
  if (stdinOption.rest.length > 0) throw new CliError(`Unknown login arguments: ${stdinOption.rest.join(" ")}`);
  await saveToken(config.tokenPath, token);
  renderLogin({ tokenPath: config.tokenPath }, config.format);
}

// stars logout
export async function logoutCommand(args, config) {
  if (args.length > 0) throw new CliError(`Unknown logout arguments: ${args.join(" ")}`);
  await deleteToken(config.tokenPath);
  renderLogout({ tokenPath: config.tokenPath }, config.format);
}

// stars status
export async function statusCommand(args, config) {
  if (args.length > 0) throw new CliError(`Unknown status arguments: ${args.join(" ")}`);
  renderStatus(
    {
      apiBaseUrl: config.apiBaseUrl,
      tokenPath: config.tokenPath,
      tokenConfigured: await hasToken(config.tokenPath),
    },
    config.format,
  );
}

// stars sync
export async function syncCommand(args, config) {
  if (args.length > 0) throw new CliError(`Unknown sync arguments: ${args.join(" ")}`);
  const spinner = startSpinner("Syncing...");
  let data;
  try {
    data = await apiRequest("/api/sync", { method: "POST", config });
  } finally {
    stopSpinner(spinner);
  }
  renderSync(data, config.format);
}

// stars search <query> [filters]
export async function searchCommand(args, config) {
  const parsed = searchOptions(args);
  const queryText = parsed.args.join(" ").trim();
  if (!queryText) throw new CliError("search requires a query.");
  renderSearch(
    await apiRequest("/api/search", { config, query: { ...parsed.query, q: queryText } }),
    config.format,
  );
}

// stars show <repo-id|owner/repo>
export async function showCommand(args, config) {
  const repoOrId = args.join(" ").trim();
  if (!repoOrId) throw new CliError("show requires a repository id or owner/repo.");
  renderRepo(await resolveRepo(repoOrId, config), config.format);
}

// stars open <repo> [--print]
// 修复 #27：默认仅打开浏览器；--print 仅打印 URL 不打开
export async function openCommand(args, config) {
  const { found: printOnly, rest } = readFlag(args, "--print");
  const repoOrId = rest.join(" ").trim();
  if (!repoOrId) throw new CliError("open requires a repository id or owner/repo.");
  const repo = await resolveRepo(repoOrId, config);
  if (!repo.htmlUrl) throw new CliError(`Repository has no URL: ${repo.fullName ?? repoOrId}`);
  if (printOnly) {
    console.log(repo.htmlUrl);
    return;
  }
  await openUrl(repo.htmlUrl);
}

// stars ask <question>
export async function askCommand(args, config) {
  const question = args.join(" ").trim();
  if (!question) throw new CliError("ask requires a question.");
  const spinner = startSpinner("Thinking...");
  let data;
  try {
    data = await apiRequest("/api/ai/ask", { method: "POST", config, body: { question } });
  } finally {
    stopSpinner(spinner);
  }
  renderAsk(data, config.format);
}

// stars favorite|unfavorite <repo>
export async function favoriteCommand(command, args, config) {
  const repoOrId = args.join(" ").trim();
  if (!repoOrId) throw new CliError(`${command} requires a repository id or owner/repo.`);
  renderRepo(
    await patchRepoCuration(repoOrId, { isFavorite: command === "favorite" }, config),
    config.format,
  );
}

// stars star <owner/repo|repo-id>
// 真实调用 GitHub star API（POST /api/repos/star），与 favorite（本地标记）不同。
// 接受任意 owner/repo，哪怕之前从未收藏过。
export async function starCommand(args, config) {
  const repo = args.join(" ").trim();
  if (!repo) throw new CliError("star requires a repository id or owner/repo.");
  const spinner = startSpinner("Starring...");
  let data;
  try {
    data = await apiRequest("/api/repos/star", { method: "POST", config, body: { repo } });
  } finally {
    stopSpinner(spinner);
  }
  renderRepo(data, config.format);
}

// stars unstar <owner/repo|repo-id>
// 真实调用 GitHub unstar API（POST /api/repos/unstar），与 unfavorite（本地标记）不同。
// 只对已在本地收藏列表中的仓库生效。
export async function unstarCommand(args, config) {
  const repo = args.join(" ").trim();
  if (!repo) throw new CliError("unstar requires a repository id or owner/repo.");
  const spinner = startSpinner("Unstarring...");
  let data;
  try {
    data = await apiRequest("/api/repos/unstar", { method: "POST", config, body: { repo } });
  } finally {
    stopSpinner(spinner);
  }
  renderRepo(data, config.format);
}

// stars note <repo> (--set <text>|--clear)
export async function noteCommand(args, config) {
  let rest = [...args];
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
}

// stars tag add|remove <repo> <tag>
// 修复 #32：repo 与 tag 各为单个 token，多余参数报错
export async function tagCommand(args, config) {
  const action = args[0];
  if (!["add", "remove"].includes(action)) {
    throw new CliError("tag requires add or remove.");
  }
  const repoOrId = args[1];
  const tag = args[2];
  if (!repoOrId || !tag) {
    throw new CliError(`tag ${action} requires a repository id or owner/repo and a tag.`);
  }
  if (args.length > 3) {
    throw new CliError(`tag ${action} accepts exactly one repo and one tag. Got extra: ${args.slice(3).join(" ")}`);
  }
  const data = action === "add" ? await addTag(repoOrId, tag, config) : await removeTag(repoOrId, tag, config);
  renderTags(data, config.format);
}

// stars suggest [--focus duplicates|stale|untagged|all]
// 调用 GET /api/repos/suggestions，输出知识整理建议（重复 / 过时 / 未分类）
export async function suggestCommand(args, config) {
  const VALID_FOCUSES = ["duplicates", "stale", "untagged", "all"];
  const { value: focus, rest } = readOption(args, "--focus");
  if (focus !== undefined && !VALID_FOCUSES.includes(focus)) {
    throw new CliError(`--focus must be one of: ${VALID_FOCUSES.join(", ")}.`);
  }
  if (rest.length > 0) throw new CliError(`Unknown suggest arguments: ${rest.join(" ")}`);
  const data = await apiRequest("/api/repos/suggestions", {
    config,
    query: { focus: focus ?? "all" },
  });
  renderSuggest(data, config.format);
}

// stars analyze <repo> [--apply]
// 调用 POST /api/ai/analyze，仓库分析 + 智能标注；--apply 应用建议到已 star 仓库
export async function analyzeCommand(args, config) {
  const { found: apply, rest } = readFlag(args, "--apply");
  const repo = rest.join(" ").trim();
  if (!repo) throw new CliError("analyze requires a repository id or owner/repo.");
  const spinner = startSpinner("Analyzing...");
  let data;
  try {
    data = await apiRequest("/api/ai/analyze", {
      method: "POST",
      config,
      body: { repo, applySuggestions: apply },
    });
  } finally {
    stopSpinner(spinner);
  }
  renderAnalyze(data, config.format);
}
