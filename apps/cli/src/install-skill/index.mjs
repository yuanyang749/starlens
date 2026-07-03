// install-skill 安装向导主流程
// 修复汇总：
//  #7  --local 语义明确化，stdio 模式校验 projectRoot
//  #8  token 复用：同时检查 agent.env 与 CLI token 文件
//  #11 --client other 输出配置片段而非静默
//  #12 --hosted + --local 冲突报错
//  #14 install-skill 支持 --token-stdin 与 STARLENS_TOKEN 环境变量
//  #18 isGlobalInstall 用 realpathSync，更稳健
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { sep } from "node:path";
import { CliError } from "../errors.mjs";
import { readOption, readFlag } from "../args.mjs";
import { fetchWithTimeout } from "../api.mjs";
import {
  HOSTED_MCP_BASE_URL,
  DEFAULT_API_BASE_URL,
} from "../config.mjs";
import {
  readExistingToken,
  readStdin,
  readToken,
  hasToken,
  saveToken,
  writeAgentEnv,
  agentEnvExists,
} from "../token.mjs";
import {
  createReadlineInterface,
  wizardPrompt,
  wizardPromptSecret,
  wizardCheckbox,
  maskToken,
} from "./prompts.mjs";
import { findProjectRoot, isHostedUrl, buildMcpArgs } from "./env.mjs";
import { installSkillFiles } from "./skill-installer.mjs";
import { writeMcpConfig } from "./mcp-config.mjs";

const CLIENT_LABELS = {
  claude: "Claude Code",
  cursor: "Cursor",
  vscode: "VS Code (Copilot)",
  codex: "Codex CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  other: "Other",
};

const MCP_SUPPORTED = new Set(["claude", "cursor", "codex", "opencode"]);

const CLIENT_ITEMS = [
  { value: "claude", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code (Copilot)", skillOnly: true },
  { value: "codex", label: "Codex CLI" },
  { value: "opencode", label: "OpenCode" },
  { value: "openclaw", label: "OpenClaw", skillOnly: true },
  { value: "hermes", label: "Hermes", skillOnly: true },
  { value: "other", label: "Other (output config snippet only)", skillOnly: true },
];

// 判断是否为全局安装（而非从源码运行）。
// 修复 #18：用 realpathSync 解析软链，避免子串匹配误判。
function isGlobalInstall() {
  try {
    const real = realpathSync(process.argv[1]);
    // 源码运行时路径含 apps/cli；全局安装在 node_modules 下
    return !real.includes(`${sep}apps${sep}cli`);
  } catch {
    return true;
  }
}

async function spawnCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

// 读取所有可能的 token 来源（不含 --token 参数，那已在上层处理）。
// 优先级：--token-stdin > STARLENS_TOKEN env > agent.env > CLI token 文件
async function resolveTokenFromSources({ tokenStdin, env, tokenPath }) {
  if (tokenStdin) {
    return await readStdin();
  }
  if (env.STARLENS_TOKEN) {
    return env.STARLENS_TOKEN;
  }
  const fromAgentEnv = await readExistingToken();
  if (fromAgentEnv) return fromAgentEnv;
  // 复用 CLI 登录的 token 文件
  if (await hasToken(tokenPath)) {
    try {
      return await readToken(tokenPath);
    } catch {
      /* ignore */
    }
  }
  return "";
}

export async function runInstallSkillWizard(args, config, env) {
  let rest = [...args];

  // 注意：--api-base-url 已被 parseGlobalOptions 剥离到 config.apiBaseUrl，
  // 这里不再重复解析；仅解析 install-skill 专属参数。
  const tokenArg = readOption(rest, "--token");
  rest = tokenArg.rest;
  const clientArg = readOption(rest, "--client");
  rest = clientArg.rest;
  const tokenStdinFlag = readFlag(rest, "--token-stdin");
  rest = tokenStdinFlag.rest;
  const hostedArg = readFlag(rest, "--hosted");
  rest = hostedArg.rest;
  const localArg = readFlag(rest, "--local");
  rest = localArg.rest;

  // 修复 #12：--hosted 与 --local 互斥
  if (hostedArg.found && localArg.found) {
    throw new CliError("--hosted and --local are mutually exclusive.");
  }

  console.log("");
  console.log("Starlens Install Wizard");
  console.log("═".repeat(40));
  console.log("This wizard guides you through Skill installation and optional MCP Server setup.");
  console.log("");

  // Step 0: check global install
  if (!isGlobalInstall()) {
    console.log("Tip: you are running from source. To use `stars` globally,");
    console.log("      install first: npm install -g @starlens-app/cli");
    console.log("");
  }

  let rl;
  try {
    // Step 1: 多选客户端
    let clients;
    const clientArgRaw = clientArg.value?.toLowerCase();
    if (clientArgRaw) {
      const valid = new Set(CLIENT_ITEMS.map((it) => it.value));
      clients = clientArgRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => valid.has(s));
      if (clients.length === 0) {
        throw new CliError(`--client has no valid value. Valid: ${[...valid].join(", ")}`);
      }
      console.log(`Selected clients: ${clients.map((c) => CLIENT_LABELS[c]).join(", ")}`);
    } else {
      console.log("");
      clients = await wizardCheckbox(CLIENT_ITEMS);
      console.log(`Selected: ${clients.map((c) => CLIENT_LABELS[c]).join(", ")}`);
    }

    // wizardCheckbox（raw mode）完成后再创建 readline，避免 Enter 残留字符被提前消费
    rl = createReadlineInterface();

    const cwd = process.cwd();

    // Step 2: 安装 Skill（默认是）
    console.log("");
    console.log("─".repeat(40));
    const installSkill = await wizardPrompt(rl, "Install Starlens Skill files? (Y/n)", "Y");
    if (!/^n$/i.test(installSkill)) {
      console.log("");
      console.log("Installing Starlens Agent Skill...");
      for (const client of clients) {
        // 修复 #11：other 客户端不做自动安装，仅后续输出片段
        if (client === "other") {
          console.log(`• ${CLIENT_LABELS.other}: skipped auto-install (will output snippet later)`);
          continue;
        }
        const skillResult = await installSkillFiles(client, cwd);
        if (skillResult.results) {
          for (const r of skillResult.results) {
            if (r.ok) {
              console.log(`✓ Skill installed: ${r.path}`);
            } else {
              console.log(`⚠  Skill install failed: ${r.path} (${r.reason})`);
            }
          }
        } else if (!skillResult.ok) {
          console.log(`⚠  ${CLIENT_LABELS[client]}: ${skillResult.reason}`);
        }
      }
    } else {
      console.log("Skipped Skill installation.");
    }

    // Step 3: 配置 MCP（可选，默认否）
    console.log("");
    console.log("─".repeat(40));
    const mcpClients = clients.filter((c) => MCP_SUPPORTED.has(c));
    const otherClients = clients.filter((c) => c === "other");

    let token = tokenArg.value ?? "";
    let apiBaseUrl = "";

    if (mcpClients.length === 0 && otherClients.length === 0) {
      console.log("Selected clients do not support MCP. Skipping MCP configuration.");
    } else {
      const promptClients = [...mcpClients, ...otherClients];
      const doMcp = await wizardPrompt(
        rl,
        `Configure MCP Server? (supports ${promptClients.map((c) => CLIENT_LABELS[c]).join(", ")}) (y/N)`,
        "N",
      );
      if (/^y$/i.test(doMcp)) {
        // 部署模式
        console.log("");
        // config.apiBaseUrl 来自全局 --api-base-url 或 STARLENS_API_BASE_URL env
        const defaultUrl = config.apiBaseUrl ?? env.STARLENS_API_BASE_URL ?? HOSTED_MCP_BASE_URL;
        let isSelfHosted;
        if (hostedArg.found) {
          isSelfHosted = false;
          console.log("✓ Hosted service mode (--hosted)");
        } else if (localArg.found) {
          isSelfHosted = true;
          console.log("✓ Self-hosted mode (--local)");
        } else {
          console.log("Deployment mode:");
          console.log("  1) Hosted (recommended) — uses starlens.520ai.xin, no local service needed");
          console.log("  2) Self-hosted — your own server or local dev environment");
          const modeChoice = await wizardPrompt(rl, "Choose mode", "1");
          isSelfHosted = modeChoice.trim() === "2";
        }

        let projectRoot = null;
        if (isSelfHosted) {
          console.log("");
          apiBaseUrl = (
            await wizardPrompt(
              rl,
              "Starlens API base URL",
              defaultUrl === HOSTED_MCP_BASE_URL ? DEFAULT_API_BASE_URL : defaultUrl,
            )
          ).replace(/\/+$/, "");
          const hosted = isHostedUrl(apiBaseUrl);
          if (!hosted) {
            // stdio 传输：需要可执行 mcp:start 的项目根目录
            const detected = await findProjectRoot(cwd);
            if (detected) {
              console.log(`Detected project root: ${detected}`);
              projectRoot = (await wizardPrompt(rl, "Project path (enter to confirm)", detected)).replace(/\/$/, "");
            } else {
              console.log("Could not auto-detect a project with `mcp:start` script.");
              projectRoot = (await wizardPrompt(rl, "Project path (absolute, must contain mcp:start script)", "")).replace(/\/$/, "");
            }
            // 修复 #7：stdio 模式下 projectRoot 必须存在且可用，否则配置必然失败
            if (!projectRoot) {
              throw new CliError(
                "Self-hosted stdio MCP requires a project path with a `mcp:start` script. " +
                  "Re-run with --hosted, or provide a valid project path.",
              );
            }
          }
        } else {
          apiBaseUrl = HOSTED_MCP_BASE_URL;
          console.log(`✓ Hosted service: ${HOSTED_MCP_BASE_URL}`);
        }

        const useHttpTransport = isHostedUrl(apiBaseUrl);

        // Token（支持历史复用，脱敏展示）
        console.log("");
        console.log("Create an API Token (stl_xxx) in Starlens settings, then paste it here.");
        if (!token) {
          // 修复 #8/#14：多来源复用
          const reused = await resolveTokenFromSources({
            tokenStdin: tokenStdinFlag.found,
            env,
            tokenPath: config.tokenPath,
          });
          if (reused) {
            const tokenHint = `press enter to reuse existing token: ${maskToken(reused)}, or enter a new one`;
            const inputToken = await wizardPromptSecret(`API Token (${tokenHint})`, rl);
            token = inputToken || reused;
          } else {
            const inputToken = await wizardPromptSecret("API Token (input hidden)", rl);
            token = inputToken;
          }
        }
        if (!token) {
          console.log("⚠  No token provided. Config snippet will show placeholder stl_xxx; replace it manually.");
        }

        // 持久化 token 到 CLI token 文件，让 hosted 与 self-hosted 模式下次都能复用（对称）。
        // self-hosted stdio 模式额外仍会写 ~/.starlens/agent.env（运行时 source 所需）。
        if (token) {
          try {
            await saveToken(config.tokenPath, token);
          } catch {
            /* 写入失败不致命，MCP 配置已含 token，仍可工作 */
          }
        }

        // 写入 agent.env（仅 stdio 模式，HTTP 模式不需要）
        if (!useHttpTransport && token) {
          let skipEnvWrite = false;
          if (await agentEnvExists()) {
            console.log("");
            const overwrite = await wizardPrompt(rl, "~/.starlens/agent.env already exists. Overwrite? (y/N)", "N");
            skipEnvWrite = !/^y$/i.test(overwrite);
          }
          if (!skipEnvWrite) {
            const envPath = await writeAgentEnv({ token, apiBaseUrl });
            console.log(`✓ Written: ${envPath}`);
          } else {
            console.log("Skipped writing agent.env.");
          }
        }

        // 对每个支持 MCP 的客户端自动写入配置
        console.log("");
        console.log("─".repeat(40));
        console.log("Configuring MCP Server...");
        for (const client of mcpClients) {
          if (client === "claude") {
            const mcpJson = useHttpTransport
              ? JSON.stringify({ type: "http", url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` } })
              : JSON.stringify({ type: "stdio", command: "zsh", args: buildMcpArgs(projectRoot) });
            console.log(`\n  ${CLIENT_LABELS.claude} config command:`);
            console.log(`  claude mcp add-json starlens '${mcpJson}'`);
            console.log("");
            const autoRun = await wizardPrompt(rl, "  Run now? (y/N)", "N");
            if (/^y$/i.test(autoRun)) {
              const ok = await spawnCommand("claude", ["mcp", "add-json", "starlens", mcpJson]);
              console.log(ok ? "  ✓ MCP server registered to Claude Code." : "  ✗ Registration failed. Run the command above manually.");
            }
          } else {
            const result = await writeMcpConfig(client, { apiBaseUrl, token, projectRoot, hosted: useHttpTransport });
            if (result.ok) {
              console.log(`✓ MCP config written: ${result.path}`);
            } else {
              console.log(`⚠  ${CLIENT_LABELS[client]}: ${result.reason}`);
            }
          }
        }

        // 修复 #11：other 客户端输出可复用的配置片段
        if (otherClients.length > 0) {
          console.log("");
          console.log("─".repeat(40));
          console.log("Manual config snippet for 'Other' clients:");
          const snippet = useHttpTransport
            ? JSON.stringify(
                {
                  mcpServers: {
                    starlens: { url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` } },
                  },
                },
                null,
                2,
              )
            : JSON.stringify(
                {
                  mcpServers: {
                    starlens: { command: "zsh", args: buildMcpArgs(projectRoot) },
                  },
                },
                null,
                2,
              );
          console.log(snippet);
        }

        // 验证 Token（可选）
        if (token) {
          console.log("");
          const doVerify = await wizardPrompt(rl, "Verify token validity? (y/N)", "N");
          if (/^y$/i.test(doVerify)) {
            console.log("Verifying...");
            try {
              const res = await fetchWithTimeout(
                `${apiBaseUrl}/api/search?q=test&pageSize=1`,
                { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
                8_000,
              );
              if (res.ok) {
                console.log("✓ Token verified, API connection OK.");
              } else if (res.status === 401 || res.status === 403) {
                console.log(`✗ Token invalid (HTTP ${res.status}). Check the token.`);
              } else {
                console.log(`⚠  Server returned HTTP ${res.status}. Check the API base URL.`);
              }
            } catch {
              console.log(`✗ Could not connect to ${apiBaseUrl}. Check the service is running.`);
            }
          }
        }
      } else {
        console.log("Skipped MCP configuration.");
      }
    }

    // 完成
    console.log("");
    console.log("─".repeat(40));
    console.log("✓ Setup complete!");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Restart your AI client so the config takes effect.");
    console.log("  2. In the client, try: \"search my starred repos about React\" to verify.");
    console.log(`  3. Full docs: ${HOSTED_MCP_BASE_URL}/docs/integrations`);
    console.log("");
  } finally {
    rl?.close();
  }
}
