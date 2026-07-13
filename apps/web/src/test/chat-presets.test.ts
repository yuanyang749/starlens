/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { CHAT_PRESETS, isChatPresetId } from "@starlens/workbench";
import { resolveChatPresetAgentOptions } from "@starlens/server/server/ai/ask/agent/presets";

describe("聊天预设契约", () => {
  it("提供四个高价值且稳定的预设入口", () => {
    expect(CHAT_PRESETS).toEqual([
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
    ]);
    expect(isChatPresetId("recently_active")).toBe(true);
    expect(isChatPresetId("unknown")).toBe(false);
  });

  it("为每个预设只开放一个只读数据工具和终止工具", () => {
    const expectations = {
      collection_profile: "get_repo_stats",
      recently_active: "search_repos",
      hidden_gems: "search_repos",
      local_ai_stack: "recommend_for_task",
    } as const;

    for (const [presetId, dataTool] of Object.entries(expectations)) {
      const options = resolveChatPresetAgentOptions(presetId);
      expect(options).not.toBeNull();
      expect(options?.allowedToolNames).toEqual([dataTool, "submit_answer"]);
      expect(options?.maxIterations).toBe(3);
      expect(options?.maxTokens).toBe(600);
      expect(options?.systemPrompt).toContain(dataTool);
    }

    expect(resolveChatPresetAgentOptions("unknown")).toBeNull();
  });
});
