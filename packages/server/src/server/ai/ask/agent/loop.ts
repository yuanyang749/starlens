import "server-only";

import { callChatCompletionsWithTools, stripThinkBlocks, wrapUserQuestion, type AgentChatMessage } from "../provider";
import { toRecalledCandidate } from "../ranking";
import { type AskResult, ANSWER_CANDIDATE_LIMIT, MAX_AGENT_ITERATIONS, type ChatRuntimeConfig, type SearchRepoItem } from "../types";
import { agentToolSchemas } from "./tool-schemas";
import { executeToolCall } from "./dispatch";

function buildAgentSystemPrompt(today: string): string {
  return `你是 Starlens 的仓库检索助手，通过工具查询用户的 GitHub 收藏仓库来回答问题。今天日期：${today}

工具使用指南：
- search_repos 是首选工具，覆盖绝大多数过滤/排序/关键词类问题，优先用它
- get_repo_detail 用于深入了解某个已经在之前工具结果里出现过的具体仓库
- get_repo_stats 用于统计/分布类问题；注意它返回的仓库不带 id，如果之后要具体引用某个仓库，需要再调 search_repos 或 get_repo_detail 补一个 id
- run_readonly_query 是长尾兜底，只有当 search_repos 的参数表达不了你需要的复杂过滤/聚合/join 逻辑时才用，优先尝试用 search_repos 解决

严格规则：
- 只能引用工具结果里真实出现过的仓库（id、名称、star 数等），绝对不能凭空编造
- 如果多次尝试后确实找不到匹配的仓库，如实告诉用户"没有找到匹配的仓库"，不要为了给出答案而编造或用不相关的结果凑数
- 你大概有 ${MAX_AGENT_ITERATIONS - 1} 次工具调用的预算，合理分配，不要在同一个方向反复重试；不需要考虑调用成本，准确率优先
- 必须以调用 submit_answer 结束整个流程，这是唯一被接受的终止方式，纯文字回复不算完成任务
- 回答风格：简洁中文，直接引用工具结果里的真实数据（如 Star 数），不要猜测；如果用户的收藏里有相关的备注或标签，优先提及`;
}

function buildAskResult(answer: string, repoIds: unknown, cache: Map<string, SearchRepoItem>): AskResult {
  const ids = Array.isArray(repoIds) ? repoIds.filter((id): id is string => typeof id === "string") : [];
  const candidates = ids
    .map((id) => cache.get(id))
    .filter((item): item is SearchRepoItem => Boolean(item))
    .slice(0, ANSWER_CANDIDATE_LIMIT)
    .map((item, index) => toRecalledCandidate(item, index, "AI Agent 在检索过程中确认的相关仓库"));

  return { answer: stripThinkBlocks(answer).trim() || "已完成检索，但没有生成文字说明。", candidates };
}

// 中文注释：主人明确要求不做兜底——出错/判定不支持 tool-calling/循环耗尽都直接返回 null，
// 由上层告诉用户换个问法重试，而不是拿不完整/不确定的数据凑一个看似正常的回答。
// 只有 AI 主动调用 submit_answer 时才算真正完成，是唯一的成功出口。
export async function runAgentLoop(
  question: string,
  userId: string,
  config: ChatRuntimeConfig,
): Promise<AskResult | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cache = new Map<string, SearchRepoItem>();
  const messages: AgentChatMessage[] = [
    { role: "system", content: buildAgentSystemPrompt(today) },
    { role: "user", content: wrapUserQuestion(question) },
  ];

  let noToolCallStreak = 0;

  for (let iteration = 1; iteration <= MAX_AGENT_ITERATIONS; iteration += 1) {
    const turn = await callChatCompletionsWithTools({
      messages,
      tools: agentToolSchemas,
      config,
      userId,
      maxTokens: 800,
    });

    if (!turn) return null;

    messages.push({ role: "assistant", content: turn.content, tool_calls: turn.tool_calls });

    const toolCalls = turn.tool_calls ?? [];
    const submitCall = toolCalls.find((call) => call.function.name === "submit_answer");

    if (submitCall) {
      let args: { answer?: unknown; repoIds?: unknown };
      try {
        args = JSON.parse(submitCall.function.arguments || "{}");
      } catch (error) {
        // LLM 偶尔会返回畸形 JSON（长上下文/复杂 schema 时更常见）。记录原文（截断）便于
        // prompt 调优和 Provider 选型决策，否则线上无法区分"LLM 输出畸形"还是"Provider 鉴权失败"。
        const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[ai/ask] submit_answer arguments JSON parse failed: error=${msg} args=${(submitCall.function.arguments || "").slice(0, 500)}`);
        return null;
      }
      if (typeof args.answer !== "string" || !args.answer.trim()) return null;
      return buildAskResult(args.answer, args.repoIds, cache);
    }

    if (toolCalls.length === 0) {
      noToolCallStreak += 1;
      // 连续两轮都不调用任何工具——判定这个 Provider 不支持/不配合 tool-calling，没有真实数据支撑，直接放弃
      if (noToolCallStreak >= 2) return null;
      messages.push({
        role: "user",
        content: "你必须调用一个工具（search_repos / get_repo_detail / get_repo_stats / run_readonly_query / submit_answer），不能只回复文字。",
      });
      continue;
    }

    noToolCallStreak = 0;
    for (const call of toolCalls) {
      messages.push(await executeToolCall(call, userId, cache));
    }
  }

  // 循环耗尽都没有 submit_answer——不猜测、不拼凑答案，直接判失败
  return null;
}
