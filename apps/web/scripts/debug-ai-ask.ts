// 调试脚本：绕过 /api/ai/ask 路由的 30s 超时和 MAX_AGENT_ITERATIONS(6) 上限，
// 默认跑满 50 轮工具调用、不设超时，并逐轮打印模型输出 / 工具调用 / 工具结果，
// 用于排查线上 "Could not find a confident answer" 的真实根因
// （Provider 请求失败 / 不配合 tool-calling / 循环耗尽 / submit_answer 参数畸形 等）。
//
// 用法（在 apps/web 目录下）：
//   npx tsx --conditions=react-server scripts/debug-ai-ask.ts "哪些仓库适合做本地 agent 工具" \
//     --github-login <你的 GitHub 用户名> --env ../../.env
//
// 参数：
//   位置参数 0        问题文本，默认 "哪些仓库适合做本地 agent 工具"
//   --env <path>      env 文件路径（相对 apps/web），默认 ../../.env（本地）；生产数据用 ../../.env.neon
//   --user-id <uuid>  直接指定 users.id
//   --github-login <login>  按 github_accounts.github_login 查 userId（二选一，与 --user-id 互斥）
//   --max-iterations <n>    默认 50
//   --model <name>    覆盖 resolveAiRuntimeConfig 解析出来的 model 字段，baseUrl/apiKey 不变——
//                      仅适用于 baseUrl 是网关型 Provider（本项目场景下是 newapi.520ai.xin，
//                      一个 OpenAI 兼容的多模型网关）、换个 model 名字就能路由到别的底层模型的情况
//
// 注意：--conditions=react-server 是绕过 "server-only" 包运行期硬抛错的必要 node 参数
// （@starlens/server 下的 db/auth 文件顶部都有 import "server-only"，仅在 react-server
// 条件下才解析到它的空实现 empty.js，否则会直接 throw）。

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Flags = Record<string, string>;

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      const hasValue = next !== undefined && !next.startsWith("--");
      flags[key] = hasValue ? next : "true";
      if (hasValue) i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) {
    console.error(`Environment file not found: ${envPath}`);
    process.exit(1);
  }
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // 只在真实环境变量尚未设置时才用文件值填充，允许调用方用 shell env 覆盖
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function truncate(text: string, max = 500) {
  return text.length > max ? `${text.slice(0, max)}…(${text.length} chars)` : text;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const question = positional[0] ?? "哪些仓库适合做本地 agent 工具";
  const envPath = resolve(process.cwd(), flags.env ?? "../../.env");
  const maxIterations = flags["max-iterations"] ? Number(flags["max-iterations"]) : 50;

  loadEnvFile(envPath);

  // 必须在 env 变量设置完之后才动态 import，否则 getDb() 初始化连接池时会读到空 DATABASE_URL
  const { getDb } = await import("@starlens/server/db/client");
  const { githubAccounts } = await import("@starlens/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const { resolveAiRuntimeConfig } = await import("@starlens/server/server/ai/configs");
  const { asChatRuntimeConfig } = await import("@starlens/server/server/ai/ask/provider");
  const { runAgentLoop } = await import("@starlens/server/server/ai/ask/agent/loop");

  let userId = flags["user-id"];
  if (!userId) {
    const githubLogin = flags["github-login"];
    if (!githubLogin) {
      console.error("必须指定 --user-id <uuid> 或 --github-login <login>");
      process.exit(1);
    }
    const db = getDb();
    const row = await db.query.githubAccounts.findFirst({ where: eq(githubAccounts.githubLogin, githubLogin) });
    if (!row) {
      console.error(`未找到 github_accounts.github_login=${githubLogin} 对应的用户`);
      process.exit(1);
    }
    userId = row.userId;
  }

  console.log(`[debug] userId=${userId}`);

  const runtimeResolution = await resolveAiRuntimeConfig(userId, "chat_completions");
  let chatConfig = asChatRuntimeConfig(runtimeResolution.config);

  if (!chatConfig) {
    console.error("[debug] 无法解析出可用的 AI Provider 配置（既没有用户默认配置，也没有系统默认配置），到这一步就已经能确定不是 Agent 循环本身的问题。");
    process.exit(1);
  }

  if (flags.model) {
    chatConfig = { ...chatConfig, model: flags.model };
  }

  console.log(
    `[debug] provider source=${runtimeResolution.source} model=${chatConfig.model}${flags.model ? " (overridden)" : ""} baseUrl=${chatConfig.baseUrl}`,
  );

  console.log(`[debug] question="${question}" maxIterations=${maxIterations} timeout=disabled\n`);

  const startedAt = Date.now();

  const result = await runAgentLoop(question, userId, chatConfig, {
    maxIterations,
    onEvent: (event) => {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      switch (event.type) {
        case "iteration_start":
          console.log(`\n── iteration ${event.iteration}/${maxIterations} (t=${elapsed}s) ──`);
          break;
        case "model_turn":
          console.log(`  model content: ${event.content ? truncate(JSON.stringify(event.content), 300) : "(null)"}`);
          if (event.toolCalls.length > 0) {
            for (const call of event.toolCalls) {
              console.log(`  model requested tool: ${call.name}(${truncate(call.arguments, 300)})`);
            }
          } else {
            console.log("  model requested no tool call");
          }
          break;
        case "tool_call":
          console.log(`  → tool result [${event.name}]: ${truncate(event.result)}`);
          break;
        case "no_tool_call":
          console.log(`  ⚠ no-tool-call streak=${event.streak}`);
          break;
        case "provider_failed":
          console.log("  ✗ provider 请求失败（详见上方 [ai/ask] console.warn 输出的 status/error）");
          break;
        case "provider_fallback":
          console.log(`  ↻ 主模型 ${event.fromModel} 请求失败，切换到兜底模型 ${event.toModel} 重试`);
          break;
        case "submit_answer":
          console.log(`  ✓ submit_answer: answer="${event.answer}" repoIds=${JSON.stringify(event.repoIds)}`);
          break;
        case "give_up":
          console.log(`\n[debug] GIVE UP: ${event.reason}`);
          break;
      }
    },
  });

  const elapsedTotal = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[debug] finished in ${elapsedTotal}s`);
  console.log(result ? `[debug] RESULT:\n${JSON.stringify(result, null, 2)}` : "[debug] RESULT: null（Agent 循环放弃，具体原因见上面的 GIVE UP 行）");

  process.exit(0);
}

main().catch((error) => {
  console.error("[debug] uncaught error:", error);
  process.exit(1);
});
