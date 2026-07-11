// Skill 刷新逻辑：给 `stars update` 复用(--skill-only 单独调用)
// 重构: 从 CLI 内部复制改为调用 npx skills add(agentskills.io 标准方式)
import { spawn } from "node:child_process";

const GITHUB_REPO_URL = "https://github.com/yuanyang749/starlens";

// 调用 npx skills add 刷新 skill 文件。
// npx skills add 会扫描仓库的 skills/ 目录并安装到各客户端约定路径。
// 返回 true/false 表示成功/失败。
export async function refreshInstalledSkills() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["skills", "add", GITHUB_REPO_URL], { stdio: "inherit" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
