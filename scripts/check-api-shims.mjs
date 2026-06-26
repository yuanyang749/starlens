#!/usr/bin/env node
// 校验 Web / Mobile API shim 一致性
// 用法: node scripts/check-api-shims.mjs
// 报告 Web 端有但 Mobile 端缺失的 API 路由，避免新增接口时遗漏 Mobile 端 shim。

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEB_API_DIR = join(ROOT, "apps", "web", "src", "app", "api");
const MOBILE_API_DIR = join(ROOT, "apps", "mobile", "src", "app", "api");

// Mobile 端不需要的 Web 专属路由（显式排除）
const MOBILE_EXCLUDED = new Set([
  "admin/users",   // 管理后台，Mobile 端暂不提供
  "mcp",           // MCP 协议端点，仅 Web 暴露
  "version",       // 版本检查，Web/Mobile 各自实现（导入不同 package.json）
]);

/**
 * 递归收集目录下所有 route.ts 文件的相对路径
 * @param {string} dir
 * @returns {Promise<string[]>} 相对于 api 目录的路径，如 "ai/ask/route.ts"
 */
async function collectRoutes(dir) {
  const results = [];

  async function scan(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name === "route.ts") {
        results.push(relative(dir, fullPath).split(sep).join("/"));
      }
    }
  }

  await scan(dir);
  return results;
}

/**
 * 从 route.ts 文件内容提取 server 包路由路径
 * @param {string} content
 * @returns {string | null} 如 "@starlens/server/routes/ai/ask/route"
 */
function extractServerRoute(content) {
  const match = content.match(/export\s+\*\s+from\s+["'](@starlens\/server\/routes\/[^"']+)["']/);
  return match ? match[1] : null;
}

async function main() {
  const [webRoutes, mobileRoutes] = await Promise.all([
    collectRoutes(WEB_API_DIR),
    collectRoutes(MOBILE_API_DIR),
  ]);

  const mobileSet = new Set(mobileRoutes);
  const missing = [];
  const mismatches = [];

  // 检查 Web 有但 Mobile 缺失的路由
  for (const route of webRoutes) {
    const routePath = route.replace("/route.ts", "");
    if (MOBILE_EXCLUDED.has(routePath)) continue;

    if (!mobileSet.has(route)) {
      missing.push(routePath);
    }
  }

  // 检查 Mobile 端路由是否正确 re-export server 路由
  for (const route of mobileRoutes) {
    const fullPath = join(MOBILE_API_DIR, route);
    const content = await readFile(fullPath, "utf-8");
    const serverRoute = extractServerRoute(content);

    if (!serverRoute) {
      const webContent = await readFile(join(WEB_API_DIR, route), "utf-8").catch(() => null);
      const webServerRoute = webContent ? extractServerRoute(webContent) : null;

      if (webServerRoute) {
        mismatches.push({
          route: route.replace("/route.ts", ""),
          issue: `Mobile 端未 re-export server 路由，Web 端导出: ${webServerRoute}`,
        });
      }
    }
  }

  // 输出报告
  console.log("── API Shim 一致性检查 ─────────────────────────\n");

  if (missing.length === 0 && mismatches.length === 0) {
    console.log("✓ Web / Mobile API 路由一致，无缺失或不一致项。");
    process.exit(0);
  }

  if (missing.length > 0) {
    console.log(`✗ Mobile 端缺失 ${missing.length} 个 API 路由：\n`);
    for (const route of missing) {
      console.log(`  ${route}`);
    }
    console.log("");
    console.log("  补齐方式：在 apps/mobile/src/app/api/ 下创建对应 route.ts，内容为：");
    console.log(`  export * from "@starlens/server/routes/${missing[0]}/route";\n`);
  }

  if (mismatches.length > 0) {
    console.log(`⚠ ${mismatches.length} 个 Mobile 路由与 Web 端不一致：\n`);
    for (const m of mismatches) {
      console.log(`  ${m.route}: ${m.issue}`);
    }
  }

  process.exit(1);
}

main().catch((err) => {
  console.error("校验脚本执行失败:", err);
  process.exit(1);
});
