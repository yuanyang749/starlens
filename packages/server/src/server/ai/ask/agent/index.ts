import "server-only";

import type { AskResult, ChatRuntimeConfig } from "../types";
import { runAgentLoop } from "./loop";

const AGENT_LOOP_TIMEOUT_MS = 30_000;

// 中文注释：唯一对外入口。外层再包一层硬超时，保证"搜索框"这种单次问答交互
// 不会无限等下去——即使某个 Provider 请求挂住不返回，30 秒后也会放弃并让用户重试。
export async function answerWithAgent(
  question: string,
  userId: string,
  config: ChatRuntimeConfig,
): Promise<AskResult | null> {
  try {
    return await Promise.race([
      runAgentLoop(question, userId, config),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), AGENT_LOOP_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    // 中文注释：Agent 链路最外层兜底——任何未捕获异常都在这里转成 null 返回给用户。
    // 不打印 config.apiKey，只记录 error 类型/消息和 question 前缀，方便线上排查根因。
    // 同 provider.ts 历史 bug 的同构形态：出错 → 静默 null → 路由返回模糊错误 → 无线索。
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/ask] agent loop crashed: userId=${userId} question=${question.slice(0, 80)} error=${msg}`);
    return null;
  }
}
