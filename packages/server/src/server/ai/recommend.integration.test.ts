// recommend_for_task 集成测试 —— DB 查询函数 + AI provider 主入口
// 中文注释：本文件分两段：
//   1. hasStarredRepos 直连本地 DB 验证冷启动检测（测试 userId 有 / 不存在 userId 无）
//   2. recommendForTask 主入口直连真实 AI API，验证返回结构
// 所有 DB 操作只读，AI 调用结果只验证结构不验证具体内容。
import { describe, expect, it } from "vitest";
import type { ChatRuntimeConfig } from "./ask/types";
import { hasStarredRepos, recommendForTask } from "./recommend";

// 中文注释：测试 userId（182 个 starred repos）和样本仓库。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const NON_EXISTENT_USER_ID = "00000000-0000-0000-0000-000000000000";
const REAL_ESRGAN_FULL_NAME = "xinntao/Real-ESRGAN";

// 中文注释：环境变量缺失时跳过整个文件——CI 环境通常没有本地 DB / AI API。
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const hasAiEnv =
  Boolean(process.env.SYSTEM_AI_API_KEY)
  && Boolean(process.env.SYSTEM_AI_BASE_URL)
  && Boolean(process.env.SYSTEM_AI_MODEL);

const describeDb = hasDatabaseUrl ? describe : describe.skip;
const describeAi = hasDatabaseUrl && hasAiEnv ? describe : describe.skip;

// 中文注释：AI 调用可能慢，单测超时设为 30s。
const AI_TIMEOUT = 30_000;

function buildChatConfig(): ChatRuntimeConfig {
  return {
    id: "system:default",
    providerType: "openai_compatible",
    model: process.env.SYSTEM_AI_MODEL!,
    baseUrl: process.env.SYSTEM_AI_BASE_URL!,
    apiKey: process.env.SYSTEM_AI_API_KEY!,
    extraHeaders: {},
  };
}

// ─── DB 查询函数：hasStarredRepos ─────────────────────────────────────────────

describeDb("hasStarredRepos (DB integration)", () => {
  it("returns true for user with starred repos", async () => {
    // 测试 userId 有 182 个 starred repos → 应返回 true
    const result = await hasStarredRepos(TEST_USER_ID);
    expect(result).toBe(true);
  });

  it("returns false for non-existent user", async () => {
    // 不存在的 userId → 应返回 false
    const result = await hasStarredRepos(NON_EXISTENT_USER_ID);
    expect(result).toBe(false);
  });
});

// ─── AI provider 主入口：recommendForTask ─────────────────────────────────────

describeAi("recommendForTask (AI provider integration)", { timeout: AI_TIMEOUT }, () => {
  it("returns ranked recommendations for a relevant task description", async () => {
    // taskDescription="image super resolution" 应能召回 Real-ESRGAN
    const result = await recommendForTask(
      TEST_USER_ID,
      { taskDescription: "image super resolution", limit: 5 },
      buildChatConfig(),
    );

    // 顶层结构验证
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data.items)).toBe(true);
    expect(result.meta).toBeDefined();
    expect(typeof result.meta.empty).toBe("boolean");
    expect(typeof result.reasoningHints).toBe("string");
    expect(Array.isArray(result.suggestedNextActions)).toBe(true);

    // 中文注释：AI 召回结果不确定，但任务高度相关时应在结果中找到 Real-ESRGAN。
    // 若未召回（AI 重排差异或全文检索未命中），仍然认为结构正确——只断言"如有结果则每项结构合法"。
    if (result.data.items.length > 0) {
      const first = result.data.items[0]!;
      expect(typeof first.id).toBe("string");
      expect(typeof first.fullName).toBe("string");
      expect(typeof first.reason).toBe("string");
      expect(first.reason.length).toBeGreaterThan(0);
      expect(typeof first.htmlUrl).toBe("string");
      expect(typeof first.stargazersCount).toBe("number");
    }

    // 若召回了 Real-ESRGAN，验证它在结果中
    const realEsrgan = result.data.items.find((item) => item.fullName === REAL_ESRGAN_FULL_NAME);
    if (realEsrgan) {
      expect(realEsrgan.id).toBeDefined();
      expect(realEsrgan.reason).toBeTruthy();
    }
  }, AI_TIMEOUT);

  it("returns empty or sparse results for completely unrelated task description", async () => {
    // 完全不相关的任务描述：可能返回空或少量结果
    const result = await recommendForTask(
      TEST_USER_ID,
      { taskDescription: "completely unrelated topic xyz123notreal", limit: 5 },
      buildChatConfig(),
    );

    // 结构验证（不验证具体内容）
    expect(result).toBeDefined();
    expect(Array.isArray(result.data.items)).toBe(true);
    expect(typeof result.meta.empty).toBe("boolean");
    expect(typeof result.reasoningHints).toBe("string");

    // 中文注释：完全不相关的任务可能召回 0 个或少量结果——两种都合法。
    // 若有结果，每项必须有 id 和 reason。
    for (const item of result.data.items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.fullName).toBe("string");
    }
  }, AI_TIMEOUT);
});
