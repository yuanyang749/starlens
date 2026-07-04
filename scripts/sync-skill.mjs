#!/usr/bin/env node
// 同步 agent-skills/starlens/ → apps/cli/skills/starlens/
// 用法: node scripts/sync-skill.mjs
//
// 背景：apps/cli 会真实发布到 npm（@starlens-app/cli），npm 打包时只能收录
// 包目录（apps/cli/）内部的文件，仓库根目录的 agent-skills/ 打不进去。
// 所以：
//   - agent-skills/starlens/ 是唯一手写源文件（SKILL.md、references/、agents/）。
//   - apps/cli/skills/starlens/ 是本脚本生成的构建产物，已加入 .gitignore，
//     不再手动维护第二份——避免"改了一处忘了改另一处"（曾经真实发生过）。
// 本脚本在 apps/cli 的 prepack 钩子（发布/打包前）和仓库根 postinstall
// （本地开发环境）里自动调用，不需要手动运行；手动跑一次也是安全的。

import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_DIR = join(ROOT, "agent-skills", "starlens");
const TARGET_DIR = join(ROOT, "apps", "cli", "skills", "starlens");

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`✗ 源目录不存在: ${SOURCE_DIR}`);
    process.exitCode = 1;
    return;
  }

  // 镜像同步而非增量合并——先清空目标目录，避免源目录删除文件后目标残留旧文件。
  await rm(TARGET_DIR, { recursive: true, force: true });
  await mkdir(TARGET_DIR, { recursive: true });
  await cp(SOURCE_DIR, TARGET_DIR, { recursive: true });

  console.log("✓ 已同步 skill 文件: agent-skills/starlens/ → apps/cli/skills/starlens/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
