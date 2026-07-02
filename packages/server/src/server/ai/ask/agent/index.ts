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
  } catch {
    return null;
  }
}
