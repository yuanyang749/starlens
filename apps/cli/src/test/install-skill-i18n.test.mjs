// install-skill 向导 i18n 测试
// 验证:语言选择交互、--lang 标志、messages 字典完整性
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { messages, checkboxLabels } from "../install-skill/messages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "..", "index.mjs");

function runCli(args, env = {}, input = "") {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

// 走完向导最短输入:选语言 → 跳过客户端选择(用 --client other 避免交互)→ 跳过 Skill → 跳过 MCP
// 实际上 --client other 仍会问 Skill 安装(n)和 MCP 配置(N),需要相应输入
const SKIP_INPUT_EN = "1\nn\nN\n";
const SKIP_INPUT_ZH = "2\nn\nN\n";

test("wizard shows Chinese when user selects option 2", async () => {
  // --client other 避免多选交互;输入:n(跳过 Skill) + N(跳过 MCP)
  const result = await runCli(["install-skill", "--client", "other"], {}, SKIP_INPUT_ZH);

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens 安装向导"), "should show Chinese wizard title");
  assert.ok(result.stdout.includes("安装 Starlens Skill 文件?"), "should show Chinese install prompt");
  assert.ok(!result.stdout.includes("Starlens Install Wizard"), "should NOT show English title");
});

test("wizard shows English when user selects option 1 (default)", async () => {
  const result = await runCli(["install-skill", "--client", "other"], {}, SKIP_INPUT_EN);

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens Install Wizard"), "should show English wizard title");
  assert.ok(result.stdout.includes("Install Starlens Skill files?"), "should show English install prompt");
  assert.ok(!result.stdout.includes("安装向导"), "should NOT show Chinese title");
});

test("wizard falls back to English on invalid language input", async () => {
  // 输入 3(非法)应 fallback 到英文默认,后续 n/N 跳过
  const result = await runCli(["install-skill", "--client", "other"], {}, "3\nn\nN\n");

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens Install Wizard"), "invalid input should fall back to English");
});

test("--lang zh flag skips language prompt and uses Chinese", async () => {
  // --lang zh 跳过语言问询,直接中文;仍需 n/N 跳过后续
  const result = await runCli(["install-skill", "--lang", "zh", "--client", "other"], {}, "n\nN\n");

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens 安装向导"), "--lang zh should show Chinese");
  // 不应出现语言选择提示
  assert.ok(!result.stdout.includes("Language / 语言"), "--lang should skip language prompt");
});

test("--lang with invalid value exits with error", async () => {
  const result = await runCli(["install-skill", "--lang", "xyz"], {});

  assert.notEqual(result.code, 0, "should exit non-zero on invalid --lang");
  assert.ok(result.stderr.includes("--lang") || result.stderr.includes("invalid"), "should mention --lang in error");
});

test("messages dictionary has identical keys in en and zh", () => {
  const enKeys = Object.keys(messages.en).sort();
  const zhKeys = Object.keys(messages.zh).sort();

  assert.deepEqual(enKeys, zhKeys, "en and zh message keys must match exactly");
});

test("checkboxLabels has identical keys in en and zh", () => {
  const enKeys = Object.keys(checkboxLabels.en).sort();
  const zhKeys = Object.keys(checkboxLabels.zh).sort();

  assert.deepEqual(enKeys, zhKeys, "checkboxLabels en and zh keys must match exactly");
});
