// MCP 配置写入：Cursor / OpenCode / Codex
// 修复 #19：用 dirname() 替代正则切目录，Windows 路径不再失效。
// 修复 #15：含 token 的配置文件写入后 chmod 0o600。
// 修复 #5：Cursor 自部署改用 zsh -lc source agent.env，与其它客户端一致，
//         不再写入占位符 env 导致鉴权失败。
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildMcpArgs } from "./env.mjs";

// 合并 JSON 配置文件。mergeFn 接收已解析对象，返回合并后的对象。
async function mergeJson(filePath, mergeFn, { mode } = {}) {
  let existing = {};
  try {
    const raw = await readFile(filePath, "utf8");
    existing = JSON.parse(raw);
  } catch {
    /* 文件不存在或格式错误则从空对象开始 */
  }
  const merged = mergeFn(existing);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2) + "\n");
  if (mode !== undefined) {
    try {
      await chmod(filePath, mode);
    } catch {
      /* chmod 失败不致命 */
    }
  }
}

// 在 TOML 文件中幂等追加/覆盖一个 [section]。
export async function appendTomlSection(filePath, sectionKey, content, { mode } = {}) {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch {
    /* 新建 */
  }
  await mkdir(dirname(filePath), { recursive: true });
  const escaped = sectionKey.replace(/\./g, "\\.");
  const sectionRegex = new RegExp(`(\\n|^)\\[${escaped}\\][\\s\\S]*?(?=\\n\\[|$)`);
  if (sectionRegex.test(existing)) {
    // 已存在 → 覆盖旧节内容，保持幂等
    await writeFile(filePath, existing.replace(sectionRegex, "\n" + content).trimStart() + "\n");
  } else {
    await writeFile(filePath, existing + (existing && !existing.endsWith("\n") ? "\n" : "") + "\n" + content + "\n");
  }
  if (mode !== undefined) {
    try {
      await chmod(filePath, mode);
    } catch {
      /* chmod 失败不致命 */
    }
  }
  return { ok: true };
}

const SECRET_MODE = 0o600;

// 为指定客户端写入 MCP 配置。
// hosted=true → HTTP 传输（token 内联，文件 chmod 0o600）
// hosted=false → stdio 传输（通过 zsh -lc source agent.env，不在配置中泄露 token）
export async function writeMcpConfig(client, { apiBaseUrl, token, projectRoot, hosted }) {
  const home = process.env.HOME || process.env.USERPROFILE;
  try {
    if (client === "cursor") {
      const cursorMcpPath = join(home, ".cursor", "mcp.json");
      const starlensEntry = hosted
        ? { url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` } }
        : { command: "zsh", args: buildMcpArgs(projectRoot), cwd: projectRoot };
      await mergeJson(
        cursorMcpPath,
        (obj) => ({ ...obj, mcpServers: { ...(obj.mcpServers ?? {}), starlens: starlensEntry } }),
        { mode: hosted ? SECRET_MODE : undefined },
      );
      return { ok: true, path: cursorMcpPath };
    }

    if (client === "opencode") {
      const opencodePath = join(home, ".config", "opencode", "opencode.json");
      // opencode schema: type must be "remote" for HTTP MCP (not "http")
      const starlensEntry = hosted
        ? { type: "remote", url: `${apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${token || "stl_xxx"}` }, enabled: true }
        : { type: "local", command: ["zsh", "-lc", `source "$HOME/.starlens/agent.env" && cd "${projectRoot}" && corepack pnpm mcp:start`], enabled: true, timeout: 10000 };
      await mergeJson(
        opencodePath,
        (obj) => ({ ...obj, mcp: { ...(obj.mcp ?? {}), starlens: starlensEntry } }),
        { mode: hosted ? SECRET_MODE : undefined },
      );
      return { ok: true, path: opencodePath };
    }

    if (client === "codex") {
      const codexPath = join(home, ".codex", "config.toml");
      // Codex TOML: transport inferred from keys (url = HTTP, command = stdio); no "type" field
      // HTTP auth uses http_headers inline table, not a [headers] sub-table
      const content = hosted
        ? `[mcp_servers.starlens]\nurl = "${apiBaseUrl}/mcp"\nhttp_headers = { Authorization = "Bearer ${token || "stl_xxx"}" }\nenabled = true\nstartup_timeout_sec = 30\ndefault_tools_approval = "approve"`
        : `[mcp_servers.starlens]\ncommand = "zsh"\nargs = ["-lc", "source \\"$HOME/.starlens/agent.env\\" && cd \\"${projectRoot}\\" && corepack pnpm mcp:start"]\nenabled = true\nstartup_timeout_sec = 30\ndefault_tools_approval = "approve"`;
      await appendTomlSection(codexPath, "mcp_servers.starlens", content, { mode: hosted ? SECRET_MODE : undefined });
      return { ok: true, path: codexPath };
    }

    return { ok: false, reason: `${client} does not support automatic MCP config writing` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
