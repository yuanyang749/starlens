// stars update：检查/更新 CLI 本体（npm），成功后自动刷新已安装的 skill 文件。
// --skill-only 跳过版本检查/npm 安装，只做刷新这一步。
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { CliError } from "./errors.mjs";
import { readOption, readFlag } from "./args.mjs";
import { getCliVersion } from "./config.mjs";
import { fetchWithTimeout } from "./api.mjs";
import { parseClientList, refreshInstalledSkills } from "./install-skill/update-skill.mjs";
import { renderUpdateSkill } from "./renderers.mjs";

const NPM_PACKAGE = "@starlens-app/cli";
const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;

// 简单按 "." 分段数值比较，够用——项目版本号都是普通 x.y.z，没必要为此引入 semver 依赖。
// 返回 >0 表示 a 更新，0 表示相同，<0 表示 a 更旧。
export function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestVersion() {
  const response = await fetchWithTimeout(REGISTRY_LATEST_URL, { headers: { Accept: "application/json" } }, 8_000);
  if (!response.ok) {
    throw new CliError(`Failed to check the latest version from npm (status ${response.status}).`);
  }
  const data = await response.json();
  if (!data?.version) {
    throw new CliError("npm registry response did not include a version.");
  }
  return data.version;
}

async function confirmUpdate(current, latest) {
  if (!process.stdin.isTTY) {
    throw new CliError(`Update available: ${current} → ${latest}. Re-run with --yes to install non-interactively.`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Update ${NPM_PACKAGE} ${current} → ${latest}? (y/N): `);
    return /^y$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function runNpmGlobalInstall() {
  return new Promise((resolve) => {
    const child = spawn("npm", ["install", "-g", `${NPM_PACKAGE}@latest`], { stdio: "inherit" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function refreshSkillsAndRender(cwd, explicitClients, config) {
  const results = await refreshInstalledSkills(cwd, explicitClients);
  if (results.length === 0) {
    console.log("No installed Starlens skill found to refresh. Run 'stars install-skill' first, or pass --client <names>.");
    return;
  }
  renderUpdateSkill(results, config.format);
}

// stars update [--yes] [--skill-only] [--client <names>]
export async function runUpdateCommand(args, config) {
  let rest = [...args];
  const yesFlag = readFlag(rest, "--yes");
  rest = yesFlag.rest;
  const skillOnlyFlag = readFlag(rest, "--skill-only");
  rest = skillOnlyFlag.rest;
  const clientArg = readOption(rest, "--client");
  rest = clientArg.rest;
  if (rest.length > 0) throw new CliError(`Unknown update arguments: ${rest.join(" ")}`);

  const explicitClients = clientArg.value ? parseClientList(clientArg.value) : undefined;
  const cwd = process.cwd();

  if (skillOnlyFlag.found) {
    await refreshSkillsAndRender(cwd, explicitClients, config);
    return;
  }

  const current = await getCliVersion();
  const latest = await fetchLatestVersion();

  if (compareVersions(current, latest) >= 0) {
    console.log(`Already up to date (v${current}).`);
    return;
  }

  if (yesFlag.found) {
    console.log(`Updating ${NPM_PACKAGE} ${current} → ${latest}...`);
  } else {
    const confirmed = await confirmUpdate(current, latest);
    if (!confirmed) {
      console.log("Update cancelled.");
      return;
    }
  }

  const ok = await runNpmGlobalInstall();
  if (!ok) {
    throw new CliError(`npm install -g ${NPM_PACKAGE}@latest failed. Update manually.`);
  }

  console.log(`\n✓ Updated to v${latest}. Refreshing installed skill files...`);
  await refreshSkillsAndRender(cwd, explicitClients, config);
}
