// Skill 文件安装：复制 skill 源目录到各客户端目标路径
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// Skill 源目录（npm 包内的 skills/starlens）。
// 本文件位于 apps/cli/src/install-skill/skill-installer.mjs，
// 上溯 3 级到 apps/cli/，再进 skills/starlens。
export function getSkillSourceDir() {
  return new URL("../../skills/starlens", import.meta.url).pathname;
}

// 各客户端全局 skill 目标路径
export const SKILL_TARGETS = {
  claude: { path: join(homedir(), ".claude", "skills", "starlens"), label: "Claude Code" },
  opencode: { path: join(homedir(), ".opencode", "skills", "starlens"), label: "OpenCode" },
  codex: { path: join(homedir(), ".codex", "skills", "starlens"), label: "Codex CLI" },
  openclaw: { path: join(homedir(), ".openclaw", "skills", "starlens"), label: "OpenClaw" },
  hermes: { path: join(homedir(), ".hermes", "skills", "starlens"), label: "Hermes" },
};

// 递归复制目录。
export async function copyDir(src, dest) {
  const { readdir } = await import("node:fs/promises");
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

// 为指定客户端安装 skill 文件。返回 { ok, results }。
// projectPath 仅对 cursor / vscode 项目级安装生效。
export async function installSkillFiles(client, projectPath) {
  const skillSrc = getSkillSourceDir();

  // 检查 skill 源是否存在（全局安装时应该存在）
  try {
    await access(skillSrc);
  } catch {
    return { ok: false, reason: "skill files not found (older version? update: npm i -g @starlens-app/cli)" };
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

  // 3. VS Code 项目级：.github/copilot-instructions.md（追加，带 marker 实现幂等）
  if (client === "vscode" && projectPath) {
    const githubDir = join(projectPath, ".github");
    const vscodeTarget = join(githubDir, "copilot-instructions.md");
    try {
      await mkdir(githubDir, { recursive: true });
      const skillContent = await readFile(join(skillSrc, "SKILL.md"), "utf8");
      // 去掉 frontmatter，只保留正文
      const body = skillContent.replace(/^---[\s\S]*?---\n/, "").trim();
      let existing = "";
      try {
        existing = await readFile(vscodeTarget, "utf8");
      } catch {
        /* 不存在则新建 */
      }
      const marker = "<!-- starlens-skill -->";
      if (!existing.includes(marker)) {
        await writeFile(vscodeTarget, existing + (existing ? "\n\n" : "") + marker + "\n" + body + "\n" + marker);
      }
      results.push({ path: vscodeTarget, ok: true });
    } catch (e) {
      results.push({ path: vscodeTarget, ok: false, reason: e.message });
    }
  }

  return { ok: results.some((r) => r.ok), results };
}
