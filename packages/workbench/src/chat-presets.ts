// 中文注释：聊天欢迎页预设的共享契约，确保 Web、移动端与请求 Hook 使用同一组稳定标识。
export const CHAT_PRESETS = [
  {
    id: "collection_profile",
    title: "收藏技术栈画像",
    description: "看懂主要语言、收藏趋势和高星项目",
    question: "分析我的收藏技术栈画像：总结仓库总量、主要语言、收藏趋势和高星项目。",
  },
  {
    id: "recently_active",
    title: "最近值得重看",
    description: "找回最近仍在活跃更新的收藏",
    question: "列出我收藏中最近仍在活跃更新的 10 个仓库，并简要说明值得重看的原因。",
  },
  {
    id: "hidden_gems",
    title: "收藏中的冷门宝藏",
    description: "发现 Star 不高但仍活跃的项目",
    question: "找出我收藏中 Star 不超过 1000、最近仍在更新的 10 个冷门宝藏。",
  },
  {
    id: "local_ai_stack",
    title: "本地 AI 项目参考",
    description: "从收藏中匹配本地知识库与 RAG 方案",
    question: "我要构建本地优先的 AI 知识库和 RAG 应用，推荐 10 个收藏仓库作为参考。",
  },
] as const;

export type ChatPresetId = (typeof CHAT_PRESETS)[number]["id"];

const CHAT_PRESET_ID_SET = new Set<string>(CHAT_PRESETS.map((preset) => preset.id));

export function isChatPresetId(value: unknown): value is ChatPresetId {
  return typeof value === "string" && CHAT_PRESET_ID_SET.has(value);
}
