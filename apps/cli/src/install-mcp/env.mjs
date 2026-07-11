// 安装向导的环境检测与路径辅助
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// 修复 #17：原实现基于 import.meta.url 上溯固定层级，
// 全局安装时指向 node_modules 而非用户项目根。
// 改为从 cwd 向上查找含 `mcp:start` 脚本的 package.json，
// 找不到返回 null（向导会提示输入或报错）。
export async function findProjectRoot(start = process.cwd()) {
  let dir = start;
  while (true) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
      if (pkg?.scripts?.["mcp:start"]) return dir;
    } catch {
      /* package.json 不存在或非法，继续向上 */
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // 到达文件系统根
    dir = parent;
  }
}

// 判断 URL 是否为"远程可达"地址（非 localhost / 127.0.0.1 / 内网）。
// 用于决定 MCP 使用 HTTP 传输还是 stdio 传输。
export function isHostedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.startsWith("192.168.");
  } catch {
    return false;
  }
}

// 构造 stdio MCP 启动命令：source agent.env 后在项目根执行 mcp:start。
export function buildMcpArgs(projectRoot) {
  return ["-lc", `source "$HOME/.starlens/agent.env" && cd "${projectRoot}" && corepack pnpm mcp:start`];
}
