// 命令分发器：解析全局选项，路由到各子命令
import { CliError } from "./errors.mjs";
import { parseGlobalOptions } from "./args.mjs";
import { getCliVersion } from "./config.mjs";
import { renderVersion, renderHelp } from "./renderers.mjs";
import {
  loginCommand,
  logoutCommand,
  statusCommand,
  syncCommand,
  searchCommand,
  showCommand,
  openCommand,
  askCommand,
  favoriteCommand,
  starCommand,
  unstarCommand,
  noteCommand,
  tagCommand,
  suggestCommand,
  analyzeCommand,
} from "./commands.mjs";
import { runSetupWizard, runInstallMcpWizard } from "./install-mcp/index.mjs";
import { runUpdateCommand } from "./self-update.mjs";

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
  "    --print  print the repository URL only, do not open a browser",
  "  stars ask <question> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars favorite <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars unfavorite <repo-id|owner/repo> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars star <owner/repo|repo-id> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "    Actually star the repo on GitHub (not just a local favorite). Works on any owner/repo.",
  "  stars unstar <owner/repo|repo-id> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "    Actually unstar the repo on GitHub (not just a local favorite). Repo must already be in your collection.",
  "  stars note <repo-id|owner/repo> (--set <text>|--clear) [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars tag add <repo-id|owner/repo> <tag> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars tag remove <repo-id|owner/repo> <tag> [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "  stars suggest [--focus duplicates|stale|untagged|all] [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "    Suggest organization improvements for starred repos (duplicates, stale, untagged).",
  "  stars analyze <repo-id|owner/repo> [--apply] [--api-base-url <url>] [--token-path <path>] [--format table|json]",
  "    Analyze a repo and suggest tags/notes. --apply writes suggestions to starred repos.",
  "  stars setup [--client <names>] [--token <token>|--token-stdin] [--api-base-url <url>] [--hosted|--local] [--lang en|zh]",
  "    Full setup wizard: installs Agent Skill (via npx skills add) + configures MCP Server.",
  "    --client       comma-separated clients for MCP config (claude, cursor, codex, opencode, vscode, openclaw, hermes, other)",
  "    --token        pre-fill API token (skips token input step)",
  "    --token-stdin  read token from stdin (avoids argv leak)",
  "    --hosted       use hosted service (starlens.520ai.xin), skip mode prompt",
  "    --local        use self-hosted service, skip mode prompt",
  "    --lang         interface language: en or zh (skips language prompt)",
  "  stars install-mcp [--client <names>] [--token <token>|--token-stdin] [--api-base-url <url>] [--hosted|--local] [--lang en|zh]",
  "    MCP-only wizard: configures MCP Server without installing Skill files.",
  "    (same flags as setup, minus skill installation)",
  "  stars update [--yes] [--skill-only]",
  "    Check npm for a newer @starlens-app/cli version, update it, then refresh installed skill files (via npx skills add).",
  "    --yes         skip the update confirmation prompt (non-interactive)",
  "    --skill-only  skip the CLI version check/update; just refresh skill files",
  "  stars version",
  "",
  "  Skill can also be installed independently: npx skills add https://github.com/yuanyang749/starlens",
  "",
  "Configuration:",
  "  --api-base-url, STARLENS_API_BASE_URL   API base URL (default: http://localhost:3000)",
  "  --token-path, STARLENS_TOKEN_PATH       Bearer token storage path (default: ~/.config/starlens/token)",
  "  --timeout-ms, STARLENS_TIMEOUT_MS       API request timeout in milliseconds (default: 30000, min 1000)",
  "  --retries, STARLENS_RETRIES             Retry count for transient API failures (default: 1)",
  "  --format, STARLENS_FORMAT               Output format: table or json (default: table)",
].join("\n");

export function getHelpText() {
  return helpText;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { args, config } = parseGlobalOptions(argv, env);
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    renderHelp(helpText, config.format);
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    renderVersion(await getCliVersion(), config.format);
    return;
  }

  if (command === "login") return loginCommand(rest, config);
  if (command === "logout") return logoutCommand(rest, config);
  if (command === "status") return statusCommand(rest, config);
  if (command === "sync") return syncCommand(rest, config);
  if (command === "search") return searchCommand(rest, config);
  if (command === "show") return showCommand(rest, config);
  if (command === "open") return openCommand(rest, config);
  if (command === "ask") return askCommand(rest, config);
  if (command === "favorite" || command === "unfavorite") return favoriteCommand(command, rest, config);
  if (command === "star") return starCommand(rest, config);
  if (command === "unstar") return unstarCommand(rest, config);
  if (command === "note") return noteCommand(rest, config);
  if (command === "tag") return tagCommand(rest, config);
  if (command === "suggest") return suggestCommand(rest, config);
  if (command === "analyze") return analyzeCommand(rest, config);

  if (command === "setup") {
    return runSetupWizard(rest, config, env);
  }

  if (command === "install-mcp") {
    return runInstallMcpWizard(rest, config, env);
  }

  // 向后兼容: install-skill 命令重定向到 setup
  if (command === "install-skill") {
    console.log("Note: 'install-skill' has been renamed to 'setup'. Redirecting...");
    return runSetupWizard(rest, config, env);
  }

  if (command === "update") return runUpdateCommand(rest, config);

  throw new CliError(`Unknown command: ${command}\n\n${helpText}`);
}
