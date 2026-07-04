// analyze_repo 集成测试 —— DB 查询函数 + AI provider 主入口
// 中文注释：本文件分两段：
//   1. resolveStarredRepo 直连本地 DB 验证仓库解析（按 id / 按 fullName / 不存在 → null）
//   2. analyzeRepo 主入口直连真实 AI API（applySuggestions=false，只读不写）
// 所有 DB 操作只读，AI 调用结果只验证结构不验证具体内容。
import { describe, expect, it } from "vitest";
import type { ChatRuntimeConfig } from "./ask/types";
import { analyzeRepo, resolveStarredRepo } from "./analyze";

// 中文注释：测试 userId（GitHub login: yuanyang749，182 个 starred repos）和样本仓库 id 来自本地开发库。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const REAL_ESRGAN_ID = "c636f221-92cc-420c-adec-f42c3a0da6ff";
const REAL_ESRGAN_FULL_NAME = "xinntao/Real-ESRGAN";
const NON_EXISTENT_ID = "00000000-0000-0000-0000-000000000000";
const NON_EXISTENT_FULL_NAME = "nonexistent-user/no-such-repo";

// 中文注释：环境变量缺失时跳过整个文件——CI 环境通常没有本地 DB / AI API。
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const hasAiEnv =
  Boolean(process.env.SYSTEM_AI_API_KEY)
  && Boolean(process.env.SYSTEM_AI_BASE_URL)
  && Boolean(process.env.SYSTEM_AI_MODEL);

const describeDb = hasDatabaseUrl ? describe : describe.skip;
const describeAi = hasDatabaseUrl && hasAiEnv ? describe : describe.skip;

// 中文注释：AI 调用可能慢（gemini-3-flash 通常 2-8s，偶发更久），单测超时设为 30s。
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

// ─── DB 查询函数：resolveStarredRepo ──────────────────────────────────────────

describeDb("resolveStarredRepo (DB integration)", () => {
  it("resolves repo by id", async () => {
    // 按 id 查找 Real-ESRGAN：应返回该仓库，fullName 匹配
    const snapshot = await resolveStarredRepo(TEST_USER_ID, REAL_ESRGAN_ID);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.fullName).toBe(REAL_ESRGAN_FULL_NAME);
    expect(snapshot?.isStarred).toBe(true);
    expect(snapshot?.id).toBe(REAL_ESRGAN_ID);
  });

  it("resolves repo by fullName", async () => {
    // 按 fullName 查找：应返回同一仓库
    const snapshot = await resolveStarredRepo(TEST_USER_ID, REAL_ESRGAN_FULL_NAME);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.fullName).toBe(REAL_ESRGAN_FULL_NAME);
    expect(snapshot?.id).toBe(REAL_ESRGAN_ID);
    expect(snapshot?.isStarred).toBe(true);
  });

  it("returns null for non-existent id", async () => {
    // 不存在的 id：返回 null
    const snapshot = await resolveStarredRepo(TEST_USER_ID, NON_EXISTENT_ID);
    expect(snapshot).toBeNull();
  });

  it("returns null for non-existent fullName", async () => {
    // 不存在的 fullName：返回 null
    const snapshot = await resolveStarredRepo(TEST_USER_ID, NON_EXISTENT_FULL_NAME);
    expect(snapshot).toBeNull();
  });
});

// ─── AI provider 主入口：analyzeRepo ──────────────────────────────────────────

describeAi("analyzeRepo (AI provider integration)", { timeout: AI_TIMEOUT }, () => {
  it("returns structured analysis for an already-starred repo with applySuggestions=false", async () => {
    // 已 star 仓库 + applySuggestions=false：纯只读，不会写库
    const result = await analyzeRepo(
      TEST_USER_ID,
      { repo: REAL_ESRGAN_FULL_NAME, applySuggestions: false },
      buildChatConfig(),
    );

    // 顶层结构
    expect(result).toBeDefined();
    expect(result.meta.empty).toBe(false);
    expect(typeof result.reasoningHints).toBe("string");
    expect(result.reasoningHints).toContain("已 star");

    // data.repo 字段
    expect(result.data.repo.fullName).toBe(REAL_ESRGAN_FULL_NAME);
    expect(result.data.repo.id).toBe(REAL_ESRGAN_ID);
    expect(result.data.isStarred).toBe(true);

    // data.summary / suitableFor / suggestedTags / suggestedNote 字段类型
    expect(typeof result.data.summary).toBe("string");
    expect(result.data.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(result.data.suggestedTags)).toBe(true);
    // suggestedTags 上限 5
    expect(result.data.suggestedTags.length).toBeLessThanOrEqual(5);
    expect(typeof result.data.suitableFor).toBe("string");
    expect(typeof result.data.suggestedNote).toBe("string");

    // applySuggestions=false → applied 必为 false
    expect(result.data.applied).toBe(false);

    // suggestedNextActions 是数组（已 star 未应用时建议 agent 引导用户加 tag/note）
    expect(Array.isArray(result.suggestedNextActions)).toBe(true);
  }, AI_TIMEOUT);
});
