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
  saveCliConfig,
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
import { messages, checkboxLabels } from "./messages.mjs";

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

// 语言选择问询:用独立 rl 问完即关,不进入主流程的行缓冲队列。
// 双语提示 "Language / 语言",默认 1 (English),回车即跳过。
async function askLanguage() {
  const { createReadlineInterface } = await import("./prompts.mjs");
  const rl = createReadlineInterface();
  try {
    return await wizardPrompt(rl, messages.en.languagePrompt, "1");
  } finally {
    rl.close();
  }
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
  const langArg = readOption(rest, "--lang");
  rest = langArg.rest;

  // 修复 #12：--hosted 与 --local 互斥
  if (hostedArg.found && localArg.found) {
    throw new CliError("--hosted and --local are mutually exclusive.");
  }

  // Step 0: 语言选择
  // --lang en|zh 可跳过交互问询;非法值报错(与 --client 校验风格一致)。
  // 无 --lang 时问用户,默认 1 (English),回车即跳过,不增加英文用户摩擦。
  // 注意:readOption 返回 { value, rest },无 found 字段;用 value !== undefined 判断。
  let locale;
  if (langArg.value !== undefined) {
    const v = (langArg.value ?? "").toLowerCase();
    if (v !== "en" && v !== "zh") {
      throw new CliError(`--lang has invalid value "${langArg.value}". Valid: en, zh.`);
    }
    locale = v;
  } else {
    const choice = await askLanguage();
    locale = choice === "2" ? "zh" : "en";
  }
  const t = messages[locale];
  const ui = checkboxLabels[locale];

  console.log("");
  console.log(t.wizardTitle);
  console.log("═".repeat(40));
  console.log(t.wizardIntro);
  console.log("");

  // Step 0: check global install
  if (!isGlobalInstall()) {
    console.log(t.sourceTip);
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
      clients = await wizardCheckbox(CLIENT_ITEMS, ui);
      console.log(`Selected: ${clients.map((c) => CLIENT_LABELS[c]).join(", ")}`);
    }

    // wizardCheckbox（raw mode）完成后再创建 readline，避免 Enter 残留字符被提前消费
    rl = createReadlineInterface();

    const cwd = process.cwd();

    // Step 2: 安装 Skill（默认是）
    console.log("");
    console.log("─".repeat(40));
    const installSkill = await wizardPrompt(rl, t.installSkillPrompt, "Y");
    if (!/^n$/i.test(installSkill)) {
      console.log("");
      console.log(t.installingSkill);
      for (const client of clients) {
        // 修复 #11：other 客户端不做自动安装，仅后续输出片段
        if (client === "other") {
          console.log(`• ${t.skillSkippedAuto.replace("{0}", CLIENT_LABELS.other)}`);
          continue;
        }
        const skillResult = await installSkillFiles(client, cwd);
        if (skillResult.results) {
          for (const r of skillResult.results) {
            if (r.ok) {
              console.log(t.skillInstalled.replace("{0}", r.path));
            } else {
              console.log(t.skillInstallFailed.replace("{0}", r.path).replace("{1}", r.reason));
            }
          }
        } else if (!skillResult.ok) {
          console.log(t.skillInstallClientFailed.replace("{0}", CLIENT_LABELS[client]).replace("{1}", skillResult.reason));
        }
      }
    } else {
      console.log(t.skillSkipped);
    }

    // Step 3: 配置 MCP（可选，默认否）
    console.log("");
    console.log("─".repeat(40));
    const mcpClients = clients.filter((c) => MCP_SUPPORTED.has(c));
    const otherClients = clients.filter((c) => c === "other");

    let token = tokenArg.value ?? "";
    let apiBaseUrl = "";

    if (mcpClients.length === 0 && otherClients.length === 0) {
      console.log(t.mcpNoSupportedClients);
    } else {
      const promptClients = [...mcpClients, ...otherClients];
      const doMcp = await wizardPrompt(
        rl,
        t.mcpConfigurePrompt.replace("{0}", promptClients.map((c) => CLIENT_LABELS[c]).join(", ")),
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
          console.log(t.hostedModeFlag);
        } else if (localArg.found) {
          isSelfHosted = true;
          console.log(t.selfHostedModeFlag);
        } else {
          console.log(t.deploymentModeTitle);
          console.log(t.deploymentModeHosted);
          console.log(t.deploymentModeSelfHosted);
          const modeChoice = await wizardPrompt(rl, t.deploymentModePrompt, "1");
          isSelfHosted = modeChoice.trim() === "2";
        }

        let projectRoot = null;
        if (isSelfHosted) {
          console.log("");
          apiBaseUrl = (
            await wizardPrompt(
              rl,
              t.apiBaseUrlPrompt,
              defaultUrl === HOSTED_MCP_BASE_URL ? DEFAULT_API_BASE_URL : defaultUrl,
            )
          ).replace(/\/+$/, "");
          const hosted = isHostedUrl(apiBaseUrl);
          if (!hosted) {
            // stdio 传输：需要可执行 mcp:start 的项目根目录
            const detected = await findProjectRoot(cwd);
            if (detected) {
              console.log(t.projectRootDetected.replace("{0}", detected));
              projectRoot = (await wizardPrompt(rl, t.projectRootConfirmPrompt, detected)).replace(/\/$/, "");
            } else {
              console.log(t.projectRootNotFound);
              projectRoot = (await wizardPrompt(rl, t.projectPathPrompt, "")).replace(/\/$/, "");
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
          console.log(t.hostedServiceUrl.replace("{0}", HOSTED_MCP_BASE_URL));
        }

        const useHttpTransport = isHostedUrl(apiBaseUrl);

        // 持久化 apiBaseUrl 到 CLI 配置文件，让 ask/search 等命令自动使用同一服务地址
        try {
          await saveCliConfig({ apiBaseUrl });
        } catch {
          /* 写入失败不致命 */
        }

        // Token（支持历史复用，脱敏展示）
        console.log("");
        console.log(t.tokenCreateHint);
        if (!token) {
          // 修复 #8/#14：多来源复用
          const reused = await resolveTokenFromSources({
            tokenStdin: tokenStdinFlag.found,
            env,
            tokenPath: config.tokenPath,
          });
          if (reused) {
            const promptText = t.tokenReuseHint.replace("{0}", maskToken(reused));
            const inputToken = await wizardPromptSecret(promptText, rl);
            token = inputToken || reused;
          } else {
            const inputToken = await wizardPromptSecret(t.tokenInputHidden, rl);
            token = inputToken;
          }
        }
        if (!token) {
          console.log(t.tokenNotProvided);
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
            const overwrite = await wizardPrompt(rl, t.agentEnvExistsPrompt, "N");
            skipEnvWrite = !/^y$/i.test(overwrite);
          }
          if (!skipEnvWrite) {
            const envPath = await writeAgentEnv({ token, apiBaseUrl });
            console.log(t.agentEnvWritten.replace("{0}", envPath));
          } else {
            console.log(t.agentEnvSkipped);
          }
        }

        // 对每个支持 MCP 的客户端自动写入配置
        console.log("");
        console.log("─".repeat(40));
        console.log(t.mcpConfiguringTitle);
        for (const client of mcpClients) {
          if (client === "claude") {
            const mcpJson = useHttpTransport
              ? JSON.stringify({ type: "http", url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` } })
              : JSON.stringify({ type: "stdio", command: "zsh", args: buildMcpArgs(projectRoot) });
            console.log(t.claudeConfigCommandLabel.replace("{0}", CLIENT_LABELS.claude));
            console.log(`  claude mcp add-json starlens '${mcpJson}'`);
            console.log("");
            const autoRun = await wizardPrompt(rl, t.claudeRunNowPrompt, "N");
            if (/^y$/i.test(autoRun)) {
              const ok = await spawnCommand("claude", ["mcp", "add-json", "starlens", mcpJson]);
              console.log(ok ? t.claudeRegistered.replace("{0}", CLIENT_LABELS.claude) : t.claudeRegisterFailed);
            }
          } else {
            const result = await writeMcpConfig(client, { apiBaseUrl, token, projectRoot, hosted: useHttpTransport });
            if (result.ok) {
              console.log(t.mcpConfigWritten.replace("{0}", result.path));
            } else {
              console.log(t.mcpConfigFailed.replace("{0}", CLIENT_LABELS[client]).replace("{1}", result.reason));
            }
          }
        }

        // 修复 #11：other 客户端输出可复用的配置片段
        if (otherClients.length > 0) {
          console.log("");
          console.log("─".repeat(40));
          console.log(t.otherClientSnippetTitle);
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
          const doVerify = await wizardPrompt(rl, t.verifyTokenPrompt, "N");
          if (/^y$/i.test(doVerify)) {
            console.log(t.verifying);
            try {
              const res = await fetchWithTimeout(
                `${apiBaseUrl}/api/search?q=test&pageSize=1`,
                { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
                8_000,
              );
              if (res.ok) {
                console.log(t.tokenVerified);
              } else if (res.status === 401 || res.status === 403) {
                console.log(t.tokenInvalid.replace("{0}", String(res.status)));
              } else {
                console.log(t.serverReturnedStatus.replace("{0}", String(res.status)));
              }
            } catch {
              console.log(t.connectFailed.replace("{0}", apiBaseUrl));
            }
          }
        }
      } else {
        console.log(t.mcpSkipped);
      }
    }

    // 完成
    console.log("");
    console.log("─".repeat(40));
    console.log(t.setupComplete);
    console.log("");
    console.log(t.nextStepsTitle);
    console.log(t.nextStep1);
    console.log(t.nextStep2);
    console.log(t.nextStep3.replace("{0}", `${HOSTED_MCP_BASE_URL}/docs/integrations`));
    console.log("");
  } finally {
    rl?.close();
  }
}
