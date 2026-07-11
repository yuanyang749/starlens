// install-mcp 向导 i18n 测试
// 验证:语言选择交互、--lang 标志、messages 字典完整性、install-skill 向后兼容重定向
//
// 注意:setup 向导会 spawn npx skills add,在测试环境中可能挂起或失败,
// 所以 i18n 交互测试用 install-mcp(不 spawn npx)覆盖。setup/install-mcp 的
// --lang 验证(在 npx spawn 之前)也能覆盖语言解析逻辑。
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { messages, checkboxLabels } from "../install-mcp/messages.mjs";

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

// install-mcp --client other 的最短输入:选语言 → 跳过 MCP 配置(N)
const SKIP_INPUT_EN = "1\nN\n";
const SKIP_INPUT_ZH = "2\nN\n";

test("install-mcp wizard shows Chinese when user selects option 2", async () => {
  const result = await runCli(["install-mcp", "--client", "other"], {}, SKIP_INPUT_ZH);

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens MCP 配置向导"), "should show Chinese MCP wizard title");
  assert.ok(!result.stdout.includes("Starlens MCP Config Wizard"), "should NOT show English title");
});

test("install-mcp wizard shows English when user selects option 1 (default)", async () => {
  const result = await runCli(["install-mcp", "--client", "other"], {}, SKIP_INPUT_EN);

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens MCP Config Wizard"), "should show English MCP wizard title");
  assert.ok(!result.stdout.includes("配置向导"), "should NOT show Chinese title");
});

test("install-mcp wizard falls back to English on invalid language input", async () => {
  // 输入 3(非法)应 fallback 到英文默认,后续 N 跳过 MCP 配置
  const result = await runCli(["install-mcp", "--client", "other"], {}, "3\nN\n");

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens MCP Config Wizard"), "invalid input should fall back to English");
});

test("--lang zh flag skips language prompt and uses Chinese", async () => {
  // --lang zh 跳过语言问询,直接中文;仍需 N 跳过 MCP 配置
  const result = await runCli(["install-mcp", "--lang", "zh", "--client", "other"], {}, "N\n");

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens MCP 配置向导"), "--lang zh should show Chinese");
  // 不应出现语言选择提示
  assert.ok(!result.stdout.includes("Language / 语言"), "--lang should skip language prompt");
});

test("--lang en flag skips language prompt and uses English", async () => {
  const result = await runCli(["install-mcp", "--lang", "en", "--client", "other"], {}, "N\n");

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Starlens MCP Config Wizard"), "--lang en should show English");
  assert.ok(!result.stdout.includes("Language / 语言"), "--lang should skip language prompt");
});

test("install-mcp --lang with invalid value exits with error", async () => {
  const result = await runCli(["install-mcp", "--lang", "xyz"], {});

  assert.notEqual(result.code, 0, "should exit non-zero on invalid --lang");
  assert.ok(result.stderr.includes("--lang") || result.stderr.includes("invalid"), "should mention --lang in error");
});

test("setup --lang with invalid value exits with error before npx spawn", async () => {
  // --lang 验证在 npx skills add 之前发生,所以这个测试是安全的(不会挂起)
  const result = await runCli(["setup", "--lang", "xyz"], {});

  assert.notEqual(result.code, 0, "should exit non-zero on invalid --lang");
  assert.ok(result.stderr.includes("--lang") || result.stderr.includes("invalid"), "should mention --lang in error");
});

test("install-skill command redirects to setup with a notice", async () => {
  // 向后兼容:install-skill 重定向到 setup。
  // setup 会先打印重定向提示,然后 resolveLocale(--lang en 跳过语言问询),
  // 再 spawn npx skills add。我们只验证重定向提示出现即可,npx 失败不影响断言。
  const result = await runCli(["install-skill", "--lang", "en"], {}, "");

  assert.ok(
    result.stdout.includes("install-skill") && result.stdout.includes("Redirecting"),
    "should show redirect notice for install-skill command",
  );
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
