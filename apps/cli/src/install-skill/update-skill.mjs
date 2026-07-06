// Skill 刷新逻辑：给 `stars update` 复用（默认流程末尾 / --skill-only 单独调用）
import { CliError } from "../errors.mjs";
import { SKILL_TARGETS, installSkillFiles, detectInstalledClients } from "./skill-installer.mjs";

// 合法的 skill 客户端集合：SKILL_TARGETS 的全局客户端 + cursor/vscode（项目级）。
// 不含 "other"——它在 install-skill 向导里也只是输出配置片段，从不落盘 skill 文件。
const VALID_CLIENTS = new Set([...Object.keys(SKILL_TARGETS), "cursor", "vscode"]);

// 解析 --client 的原始值（逗号分隔），过滤非法值；剩空则报错。
export function parseClientList(raw) {
  const clients = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_CLIENTS.has(s));
  if (clients.length === 0) {
    throw new CliError(`--client has no valid value. Valid: ${[...VALID_CLIENTS].join(", ")}`);
  }
  return clients;
}

// 刷新已安装的 skill 文件。explicitClients 不给时自动探测已安装的客户端。
// 返回摊平的结果数组：[{ client, path, ok, reason? }, ...]
export async function refreshInstalledSkills(projectPath, explicitClients) {
  const clients = explicitClients ?? (await detectInstalledClients(projectPath));
  const results = [];
  for (const client of clients) {
    const result = await installSkillFiles(client, projectPath);
    for (const r of result.results ?? []) {
      results.push({ client, ...r });
    }
  }
  return results;
}
