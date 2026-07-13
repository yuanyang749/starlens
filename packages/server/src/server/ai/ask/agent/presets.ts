import type { AgentToolName } from "./tool-schemas";

export type ChatPresetAgentOptions = {
  allowedToolNames: readonly AgentToolName[];
  maxIterations: number;
  maxTokens: number;
  systemPrompt: string;
};

type PresetDefinition = {
  dataTool: AgentToolName;
  instruction: string;
};

const PRESET_DEFINITIONS = {
  collection_profile: {
    dataTool: "get_repo_stats",
    instruction: "先且仅调用一次 get_repo_stats；读取统计结果后，立即调用 submit_answer，总结仓库总量、主要语言、收藏趋势和高星项目。",
  },
  recently_active: {
    dataTool: "search_repos",
    instruction: "先且仅调用一次 search_repos，参数固定为 sort=updated、pageSize=10；然后立即调用 submit_answer，按更新时间说明值得重看的原因。",
  },
  hidden_gems: {
    dataTool: "search_repos",
    instruction: "先且仅调用一次 search_repos，参数固定为 sort=updated、maxStars=1000、pageSize=10；然后立即调用 submit_answer，说明这些低 Star 活跃项目的价值。",
  },
  local_ai_stack: {
    dataTool: "recommend_for_task",
    instruction: "先且仅调用一次 recommend_for_task，taskDescription 使用“本地优先的 AI 知识库与 RAG 应用”，limit=10；然后立即调用 submit_answer，按用途给出推荐理由。",
  },
} satisfies Record<string, PresetDefinition>;

type ChatPresetId = keyof typeof PRESET_DEFINITIONS;

function isChatPresetId(value: unknown): value is ChatPresetId {
  return typeof value === "string" && value in PRESET_DEFINITIONS;
}

export function resolveChatPresetAgentOptions(value: unknown): ChatPresetAgentOptions | null {
  if (!isChatPresetId(value)) return null;

  const definition = PRESET_DEFINITIONS[value];
  const today = new Date().toISOString().slice(0, 10);
  return {
    allowedToolNames: [definition.dataTool, "submit_answer"],
    maxIterations: 3,
    maxTokens: 600,
    // 中文注释：预设使用短提示词和最小工具集，避免通用 Agent 的完整规则与 13 个 Schema 重复计费。
    systemPrompt: `你是 StarLens 的只读收藏仓库助手。今天日期：${today}。\n${definition.instruction}\n只能引用工具结果中的真实数据；回答使用简洁中文；不得调用其他工具。`,
  };
}
