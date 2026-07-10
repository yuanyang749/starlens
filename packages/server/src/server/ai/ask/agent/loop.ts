import "server-only";

import { callChatCompletionsWithTools, callChatCompletionsWithToolsStream, stripThinkBlocks, wrapUserQuestion, type AgentChatMessage, type AgentTurnResult } from "../provider";
import { toRecalledCandidate } from "../ranking";
import { type AskResult, ANSWER_CANDIDATE_LIMIT, MAX_AGENT_ITERATIONS, type ChatRuntimeConfig, type RecalledCandidate, type SearchRepoItem } from "../types";
import { agentToolSchemas } from "./tool-schemas";
import { executeToolCall } from "./dispatch";
import { extractAnswerString } from "./partial-json";

function buildAgentSystemPrompt(today: string): string {
  return `你是 Starlens 的仓库助手，通过工具查询和管理用户的 GitHub 收藏仓库来回答问题。今天日期：${today}

工具使用指南：
- search_repos 是首选检索工具，覆盖绝大多数过滤/排序/关键词类问题，优先用它。先用一个宽泛的核心关键词搜一次，评估结果是否够用——如果不够，换成真正不同的角度（按 language/tag/owner 过滤，或换一个语义上完全不同的词），不要反复用同义词/近义词变体搜同一个概念（比如"agent"→"local agent"→"agent tool"这种换词不换意的重试，不算真正的新尝试，是浪费）
- search_repos 最多尝试 3 次单独关键词。像"content"→"generation"→"creator"→"video"→"image"→"audio"→"prompt"→"writing"这种逐个试单词、指望撞中一个的策略，即使每次换的词表面不同，本质上也是同一种低效重试，一样要避免——第 3 次搜索仍不满意时，直接改用 run_readonly_query 写一条 SQL，用 description ILIKE '%关键词A%' OR description ILIKE '%关键词B%' OR ... 一次性覆盖多个关键词，而不是继续一个词一个词地试
- get_repo_detail 用于深入了解某个已经在之前工具结果里出现过的具体仓库
- get_repo_stats 用于统计/分布类问题；注意它返回的仓库不带 id，如果之后要具体引用某个仓库，需要再调 search_repos 或 get_repo_detail 补一个 id
- run_readonly_query 是长尾兜底，只有当 search_repos 的参数表达不了你需要的复杂过滤/聚合/join 逻辑时才用，优先尝试用 search_repos 解决
- recommend_for_task 适用于"我要做 XX，有哪些仓库可以参考"类任务推荐，基于全文检索召回候选
- find_related 用于查找与某个仓库相关的其他收藏（同 owner/同语言/同 topic）
- suggest_organization 用于扫描收藏仓库找出重复/过时/未分类问题并给出整理建议

写操作工具（仅在用户明确要求时调用）：
- add_tag / remove_tag：给仓库添加/删除标签（本地标记，不影响 GitHub）
- update_note：设置或清空仓库备注
- toggle_favorite：设置仓库的收藏★标记（应用内标记，不影响 GitHub star）
- unstar_repo：取消 GitHub star（真实调用 GitHub API，不可逆）

严格规则：
- 只能引用工具结果里真实出现过的仓库（id、名称、star 数等），绝对不能凭空编造
- 如果多次尝试后确实找不到匹配的仓库，如实告诉用户"没有找到匹配的仓库"，不要为了给出答案而编造或用不相关的结果凑数
- 写操作执行后，在回答中告知用户操作结果（成功/失败）
- unstar_repo 必须双轮确认：第一次用户要求取消 star 时，不要立即调用 unstar_repo，先用 submit_answer 回复"确认要取消 star [owner/repo] 吗？此操作不可逆，请回复'确认'继续"。只有当用户在下一轮明确回复"确认"时，才调用 unstar_repo 执行。如果用户回复其他内容或改主意，则不执行
- 你的工具调用预算比较充裕（最多约 ${MAX_AGENT_ITERATIONS - 1} 次），不需要因为怕超预算而仓促给答案，但每次调用都应该带来新信息，不要浪费在语义重复的搜索上；预算快用完时系统会额外提醒你
- 必须以调用 submit_answer 结束整个流程，这是唯一被接受的终止方式。一旦你觉得信息已经足够写出答案，下一步动作就必须是调用 submit_answer，不能先用纯文字回复"总结"一遍再等下一轮才提交——那一轮会被视为无效，白白浪费预算
- 回答风格：简洁中文，直接引用工具结果里的真实数据（如 Star 数），不要猜测；如果用户的收藏里有相关的备注或标签，优先提及`;
}

// ─── AI 对话专用系统提示词（多轮上下文） ──────────────────────────────────────
// 中文注释：在原 buildAgentSystemPrompt 基础上补充多轮语境指引。
// 原 /api/ai/ask 仍用 buildAgentSystemPrompt，不受影响。
function buildChatSystemPrompt(today: string, hasSummary: boolean): string {
  const base = buildAgentSystemPrompt(today);
  const multiTurnGuide = `

多轮对话指引：
- 用户可能基于上文追问，例如"第二个仓库详细说说"、"刚才 star 最多的那个"、"有没有用 React 的"。结合上下文理解指代
- 如果上文已检索到的仓库仍与当前问题相关，可直接引用，无需重复检索；但若用户问的是全新的角度，仍需主动检索
${hasSummary ? "- 对话早期内容已被压缩成摘要（见上方「之前的对话摘要」），其中提到的仓库 id 仍可引用\n" : ""}- 回答时可以自然承接上文，如「除了刚才提到的 X，还有 Y」`;
  return base + multiTurnGuide;
}

// ─── 历史消息策略常量（滑动窗口 + 自动摘要，对齐 Claude Code compaction） ──────
export const CHAT_RECENT_WINDOW = 20;      // 保留最近 20 条消息原文（10 轮 Q&A）
export const CHAT_COMPACT_THRESHOLD = 24;  // 超过 24 条触发 compaction（留 4 条余量，减少摘要调用频率）
export const CHAT_SUMMARY_MAX_TOKENS = 800; // 容纳更多仓库引用和决策细节

// ─── SSE 流式事件类型（AI 对话端点用） ─────────────────────────────────────────
export type ChatStreamEvent =
  | { type: "status"; status: "thinking" | "searching" | "looking_up" | "stats" | "generating"; message: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string; arguments: string }
  | { type: "done"; answer: string; candidates: RecalledCandidate[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  | { type: "error"; message: string };

// 中文注释：预算快用完时（剩余轮次 <= 该阈值）额外插一条提醒——纯静态系统提示词约束不够稳，
// 观测到模型有时会在该收尾时先扔一段纯文字总结、忘了调 submit_answer，白白烧掉一轮预算。
const ITERATIONS_REMAINING_WARNING_THRESHOLD = 3;

// 中文注释：调试脚本实测发现，对模糊问题（如"哪些仓库能帮助 AI 内容创作"）模型会陷入
// "逐个单词试 search_repos"的低效模式（content→generation→creator→video→image→...），
// 每次换的词表面不同，系统提示词里"别换同义词重试"的静态约束堵不住这种模式。跟"剩余轮次
// 预警"同一个思路，用代码层面的调用计数强制插入一次性提醒，比继续加提示词文案更可靠。
const SEARCH_REPOS_NUDGE_THRESHOLD = 3;

// 中文注释：调试专用事件钩子——生产路径（route.ts → answerWithAgent，不传 opts）完全不受影响，
// 只有显式传入 onEvent 的调用方（目前只有 scripts/debug-ai-ask.ts）才会收到逐轮事件。
export type AgentLoopEvent =
  | { type: "iteration_start"; iteration: number }
  | { type: "provider_fallback"; iteration: number; fromModel: string; toModel: string }
  | { type: "model_turn"; iteration: number; content: string | null; toolCalls: Array<{ name: string; arguments: string }> }
  | { type: "provider_failed"; iteration: number }
  | { type: "tool_call"; iteration: number; name: string; arguments: string; result: string }
  | { type: "no_tool_call"; iteration: number; streak: number }
  | { type: "submit_answer"; iteration: number; answer: string; repoIds: unknown }
  | { type: "give_up"; reason: string };

export type RunAgentLoopOptions = {
  // 覆盖 MAX_AGENT_ITERATIONS，仅供调试脚本使用；不传时行为与生产环境完全一致
  maxIterations?: number;
  onEvent?: (event: AgentLoopEvent) => void;
  // 多轮上下文：之前的 Q&A 原文 + 摘要 system 消息（不含工具调用细节），由 SSE 路由组装
  priorContext?: AgentChatMessage[];
  // 是否有摘要（影响聊天系统提示词的多轮指引文案）
  hasSummary?: boolean;
  // 流式回调（存在时改用 callChatCompletionsWithToolsStream，实时转发 token/status）
  onStream?: (event: ChatStreamEvent) => void;
};

function buildAskResult(answer: string, repoIds: unknown, cache: Map<string, SearchRepoItem>): AskResult {
  const ids = Array.isArray(repoIds) ? repoIds.filter((id): id is string => typeof id === "string") : [];
  const candidates = ids
    .map((id) => cache.get(id))
    .filter((item): item is SearchRepoItem => Boolean(item))
    .slice(0, ANSWER_CANDIDATE_LIMIT)
    .map((item, index) => toRecalledCandidate(item, index, "AI Agent 在检索过程中确认的相关仓库"));

  return { answer: stripThinkBlocks(answer).trim() || "已完成检索，但没有生成文字说明。", candidates };
}

// 中文注释：主人明确要求不做"答案兜底"——判定不支持 tool-calling/循环耗尽都直接返回 null，
// 由上层告诉用户换个问法重试，而不是拿不完整/不确定的数据凑一个看似正常的回答。
// 只有 AI 主动调用 submit_answer 时才算真正完成，是唯一的成功出口。
// 但这不妨碍做"模型兜底"——同一个网关/apiKey 下，如果主模型请求失败（超时/5xx/网关抽风），
// 换 config.fallbackModel 重试一次再判断是否真的没救，跟"答案兜底"是两件事：这里换的是
// 请求本身的可用性，不是拿不确定的结果去凑答案。
export async function runAgentLoop(
  question: string,
  userId: string,
  config: ChatRuntimeConfig,
  opts?: RunAgentLoopOptions,
): Promise<AskResult | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cache = new Map<string, SearchRepoItem>();

  // 中文注释：聊天模式（priorContext 存在）用 buildChatSystemPrompt，补充多轮指引；
  // 一次性问答（/api/ai/ask，无 priorContext）仍用 buildAgentSystemPrompt，行为不变。
  const useChatMode = Boolean(opts?.priorContext && opts.priorContext.length > 0);
  const systemPrompt = useChatMode
    ? buildChatSystemPrompt(today, opts?.hasSummary ?? false)
    : buildAgentSystemPrompt(today);

  const messages: AgentChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(opts?.priorContext ?? []),
    { role: "user", content: wrapUserQuestion(question) },
  ];

  const maxIterations = opts?.maxIterations ?? MAX_AGENT_ITERATIONS;
  const onEvent = opts?.onEvent;
  const onStream = opts?.onStream;
  let noToolCallStreak = 0;
  let searchReposCallCount = 0;
  let searchReposNudgeSent = false;
  // 中文注释：主模型请求失败时，整个循环剩余部分改用兜底模型——主模型这次失败大概率不是
  // 偶发抖动（网关/上游挂了），继续拿它试后面的轮次意义不大，切一次就一直用到底。
  let activeConfig = config;
  let fallbackTried = false;
  // 中文注释：累积本轮对话所有 provider 调用的 token 用量
  let totalUsage: { prompt_tokens?: number; completion_tokens?: number } = { prompt_tokens: 0, completion_tokens: 0 };

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    onEvent?.({ type: "iteration_start", iteration });
    onStream?.({ type: "status", status: "thinking", message: "正在思考…" });

    // 中文注释：流式模式下用 callChatCompletionsWithToolsStream，实时转发 status/tool_call/token。
    // submit_answer 的 arguments 是逐 chunk 到达的不完整 JSON，用 extractAnswerString 提取 answer
    // 字段的字符串值，与上次提取结果做差得到 delta，通过 onStream({type:"token"}) 实时转发。
    const callProvider = async (cfg: ChatRuntimeConfig): Promise<AgentTurnResult | null> => {
      if (!onStream) {
        return callChatCompletionsWithTools({
          messages, tools: agentToolSchemas, config: cfg, userId, maxTokens: 800,
        });
      }

      let submitAnswerArgs = "";
      let lastExtractedAnswer = "";
      const emittedToolStatuses = new Set<string>();

      return callChatCompletionsWithToolsStream({
        messages,
        tools: agentToolSchemas,
        config: cfg,
        userId,
        maxTokens: 800,
        onToolCallDelta: (toolName, argumentsDelta) => {
          // 每个工具首次出现时发一次 status + tool_call 事件（避免逐 delta 重复发）
          if (!emittedToolStatuses.has(toolName)) {
            emittedToolStatuses.add(toolName);
            if (toolName === "submit_answer") {
              onStream({ type: "status", status: "generating", message: "正在生成回答…" });
            } else if (toolName === "search_repos") {
              onStream({ type: "status", status: "searching", message: "正在搜索仓库…" });
            } else if (toolName === "get_repo_detail") {
              onStream({ type: "status", status: "looking_up", message: "正在查看仓库详情…" });
            } else if (toolName === "get_repo_stats") {
              onStream({ type: "status", status: "stats", message: "正在统计仓库…" });
            } else if (toolName === "run_readonly_query") {
              onStream({ type: "status", status: "searching", message: "正在查询数据库…" });
            }
            onStream({ type: "tool_call", name: toolName, arguments: "" });
          }

          // submit_answer 终止轮：提取 answer 字段并逐字转发
          if (toolName === "submit_answer") {
            submitAnswerArgs += argumentsDelta;
            const currentAnswer = extractAnswerString(submitAnswerArgs) ?? "";
            if (currentAnswer.length > lastExtractedAnswer.length) {
              const textDelta = currentAnswer.slice(lastExtractedAnswer.length);
              lastExtractedAnswer = currentAnswer;
              onStream({ type: "token", text: textDelta });
            }
          }
        },
      });
    };

    let turn = await callProvider(activeConfig);

    if (!turn && !fallbackTried && config.fallbackModel && config.fallbackModel !== activeConfig.model) {
      fallbackTried = true;
      onEvent?.({ type: "provider_fallback", iteration, fromModel: activeConfig.model, toModel: config.fallbackModel });
      activeConfig = { ...config, model: config.fallbackModel };
      turn = await callProvider(activeConfig);
    }

    if (!turn) {
      onEvent?.({ type: "provider_failed", iteration });
      onStream?.({ type: "error", message: "AI 服务暂时不可用，请稍后重试。" });
      return null;
    }

    // 中文注释：累积 token 用量
    if (turn.usage) {
      totalUsage.prompt_tokens = (totalUsage.prompt_tokens ?? 0) + (turn.usage.prompt_tokens ?? 0);
      totalUsage.completion_tokens = (totalUsage.completion_tokens ?? 0) + (turn.usage.completion_tokens ?? 0);
    }

    onEvent?.({
      type: "model_turn",
      iteration,
      content: turn.content,
      toolCalls: (turn.tool_calls ?? []).map((call) => ({ name: call.function.name, arguments: call.function.arguments })),
    });

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
        onEvent?.({ type: "give_up", reason: `submit_answer arguments JSON parse failed: ${msg}` });
        onStream?.({ type: "error", message: "回答生成失败，请重试。" });
        return null;
      }
      if (typeof args.answer !== "string" || !args.answer.trim()) {
        onEvent?.({ type: "give_up", reason: "submit_answer called with empty/invalid answer" });
        onStream?.({ type: "error", message: "回答生成失败，请重试。" });
        return null;
      }
      onEvent?.({ type: "submit_answer", iteration, answer: args.answer, repoIds: args.repoIds });
      const result = buildAskResult(args.answer, args.repoIds, cache);
      // 流式模式下发送 done 事件（token 已在流式过程中逐字转发，这里只发最终完整结果 + candidates）
      onStream?.({ type: "done", answer: result.answer, candidates: result.candidates, usage: totalUsage });
      return result;
    }

    if (toolCalls.length === 0) {
      noToolCallStreak += 1;
      onEvent?.({ type: "no_tool_call", iteration, streak: noToolCallStreak });
      // 连续两轮都不调用任何工具——判定这个 Provider 不支持/不配合 tool-calling，没有真实数据支撑，直接放弃
      if (noToolCallStreak >= 2) {
        onEvent?.({ type: "give_up", reason: "provider did not call any tool for 2 consecutive turns" });
        onStream?.({ type: "error", message: "AI 服务不支持工具调用，请检查 Provider 配置。" });
        return null;
      }
      messages.push({
        role: "user",
        content: "你必须调用一个工具（search_repos / get_repo_detail / get_repo_stats / run_readonly_query / submit_answer），不能只回复文字。",
      });
      continue;
    }

    noToolCallStreak = 0;
    for (const call of toolCalls) {
      const resultMessage = await executeToolCall(call, userId, cache);
      onEvent?.({ type: "tool_call", iteration, name: call.function.name, arguments: call.function.arguments, result: resultMessage.content });
      messages.push(resultMessage);
      if (call.function.name === "search_repos") searchReposCallCount += 1;
    }

    if (!searchReposNudgeSent && searchReposCallCount >= SEARCH_REPOS_NUDGE_THRESHOLD) {
      searchReposNudgeSent = true;
      messages.push({
        role: "user",
        content: `提醒：你已经用 search_repos 尝试了 ${searchReposCallCount} 次单独关键词，收益递减，不要继续逐词试。接下来请改用 run_readonly_query 写一条 SQL，用 description ILIKE '%关键词A%' OR description ILIKE '%关键词B%' OR ... 一次性覆盖多个关键词；或者如果已有结果基本够用，直接调用 submit_answer 收尾。`,
      });
    }

    const remainingIterations = maxIterations - iteration;
    if (remainingIterations > 0 && remainingIterations <= ITERATIONS_REMAINING_WARNING_THRESHOLD) {
      messages.push({
        role: "user",
        content: `提醒：你只剩 ${remainingIterations} 次工具调用机会。如果已有足够信息，请立即调用 submit_answer 给出答案；不要再发起新的探索性搜索。`,
      });
    }
  }

  // 循环耗尽都没有 submit_answer——不猜测、不拼凑答案，直接判失败
  onEvent?.({ type: "give_up", reason: `exhausted ${maxIterations} iterations without submit_answer` });
  onStream?.({ type: "error", message: "检索超时，未能生成回答，请换个问法重试。" });
  return null;
}
