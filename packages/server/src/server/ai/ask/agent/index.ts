import "server-only";

import type { AskResult, ChatRuntimeConfig } from "../types";
import { runAgentLoop, type RunAgentLoopOptions } from "./loop";

// 中文注释：生产环境的反向代理没有单独调大 proxy_read_timeout，用的是常见默认值 60s 左右。
// 超过这个值反代会先掐断连接，用户看到的是裸的网关超时错误，比应用层这句"ask_failed"的结构化
// 错误还难排查。50s 是在这个默认值之下留出的安全余量（response flush + TLS 开销），如果之后要
// 往上提，得先确认反向代理那边的超时配置也跟着调大，不然应用层调了也没用。
const AGENT_LOOP_TIMEOUT_MS = 50_000;

export type AnswerWithAgentOptions = RunAgentLoopOptions & {
  // 覆盖默认硬超时，仅供调试脚本使用；传 null 表示不设超时。不传时行为与生产环境完全一致。
  timeoutMs?: number | null;
};

// 中文注释：唯一对外入口。外层再包一层硬超时，保证"搜索框"这种单次问答交互
// 不会无限等下去——即使某个 Provider 请求挂住不返回，超时后也会放弃并让用户重试。
// opts 仅供调试脚本（scripts/debug-ai-ask.ts）覆盖轮数上限/超时/事件订阅——route.ts 不传 opts，行为不变。
export async function answerWithAgent(
  question: string,
  userId: string,
  config: ChatRuntimeConfig,
  opts?: AnswerWithAgentOptions,
): Promise<AskResult | null> {
  try {
    const loopPromise = runAgentLoop(question, userId, config, opts);
    if (opts?.timeoutMs === null) return await loopPromise;

    const timeoutMs = opts?.timeoutMs ?? AGENT_LOOP_TIMEOUT_MS;
    return await Promise.race([
      loopPromise,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
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
