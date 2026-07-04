// find_related 集成测试 —— DB 查询函数 + AI provider 主入口
// 中文注释：本文件分三段：
//   1. resolveTargetRepo 直连本地 DB 验证目标仓库解析（按 id / 按 fullName）
//   2. recallByOwner / recallByLanguage / recallByTopics 直连本地 DB 验证三维度召回
//   3. findRelated 主入口直连真实 AI API，验证返回结构
// 所有 DB 操作只读，AI 调用结果只验证结构不验证具体内容。
import { describe, expect, it } from "vitest";
import type { ChatRuntimeConfig } from "./ask/types";
import {
  findRelated,
  recallByLanguage,
  recallByOwner,
  recallByTopics,
  resolveTargetRepo,
} from "./related";

// 中文注释：测试 userId 和样本仓库。
const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const REAL_ESRGAN_ID = "c636f221-92cc-420c-adec-f42c3a0da6ff";
const REAL_ESRGAN_FULL_NAME = "xinntao/Real-ESRGAN";
const REAL_ESRGAN_OWNER = "xinntao";
const REAL_ESRGAN_LANGUAGE = "Python";

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

// ─── DB 查询函数：resolveTargetRepo ───────────────────────────────────────────

describeDb("resolveTargetRepo (DB integration)", () => {
  it("resolves target repo by id", async () => {
    // 按 id 查找 Real-ESRGAN：应返回该仓库
    const target = await resolveTargetRepo(TEST_USER_ID, REAL_ESRGAN_ID);
    expect(target).not.toBeNull();
    expect(target?.id).toBe(REAL_ESRGAN_ID);
    expect(target?.fullName).toBe(REAL_ESRGAN_FULL_NAME);
    expect(target?.ownerLogin).toBe(REAL_ESRGAN_OWNER);
  });

  it("resolves target repo by fullName", async () => {
    // 按 fullName 查找：应返回同一仓库
    const target = await resolveTargetRepo(TEST_USER_ID, REAL_ESRGAN_FULL_NAME);
    expect(target).not.toBeNull();
    expect(target?.id).toBe(REAL_ESRGAN_ID);
    expect(target?.fullName).toBe(REAL_ESRGAN_FULL_NAME);
  });

  it("returns null for non-existent repo", async () => {
    // 不存在的仓库：返回 null
    const target = await resolveTargetRepo(TEST_USER_ID, "nonexistent-user/no-such-repo");
    expect(target).toBeNull();
  });
});

// ─── DB 查询函数：recallByOwner / recallByLanguage / recallByTopics ──────────

describeDb("recallByOwner (DB integration)", () => {
  it("returns repos with the same owner (excluding target)", async () => {
    // 中文注释：用户只 star 了 Real-ESRGAN 这一个 xinntao 的仓库时，
    // recallByOwner 可能返回空数组——这是合法结果，只验证结构。
    const rows = await recallByOwner(TEST_USER_ID, REAL_ESRGAN_OWNER, REAL_ESRGAN_ID);
    expect(Array.isArray(rows)).toBe(true);
    // 所有返回的仓库都不应是目标仓库本身
    for (const row of rows) {
      expect(row.id).not.toBe(REAL_ESRGAN_ID);
      expect(row.ownerLogin).toBe(REAL_ESRGAN_OWNER);
    }
  });
});

describeDb("recallByLanguage (DB integration)", () => {
  it("returns Python repos excluding target", async () => {
    // 中文注释：测试用户有 182 个 starred repos，Python 仓库应能召回多个。
    const rows = await recallByLanguage(TEST_USER_ID, REAL_ESRGAN_LANGUAGE, REAL_ESRGAN_ID);
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.id).not.toBe(REAL_ESRGAN_ID);
      expect(row.language).toBe(REAL_ESRGAN_LANGUAGE);
    }
  });

  it("returns empty array for null language", async () => {
    // language=null 时直接返回空数组
    const rows = await recallByLanguage(TEST_USER_ID, null, REAL_ESRGAN_ID);
    expect(rows).toEqual([]);
  });
});

describeDb("recallByTopics (DB integration)", () => {
  it("returns repos sharing topics with target", async () => {
    // 中文注释：先取出 Real-ESRGAN 的 topics，再用这些 topics 召回。
    const target = await resolveTargetRepo(TEST_USER_ID, REAL_ESRGAN_ID);
    expect(target).not.toBeNull();
    const topics = target?.topics ?? [];

    const rows = await recallByTopics(TEST_USER_ID, topics, REAL_ESRGAN_ID);
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.id).not.toBe(REAL_ESRGAN_ID);
    }
  });

  it("returns empty array for empty topics list", async () => {
    // 空 topics 列表：直接返回空数组
    const rows = await recallByTopics(TEST_USER_ID, [], REAL_ESRGAN_ID);
    expect(rows).toEqual([]);
  });
});

// ─── AI provider 主入口：findRelated ──────────────────────────────────────────

describeAi("findRelated (AI provider integration)", { timeout: AI_TIMEOUT }, () => {
  it("returns related repos for a known target by id", async () => {
    // 用 Real-ESRGAN 的 id 查找相关仓库
    const result = await findRelated(
      TEST_USER_ID,
      { repo: REAL_ESRGAN_ID, limit: 5 },
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

    // 中文注释：测试用户有 182 个 starred repos，Python 仓库很多——
    // 应至少能从 language 维度召回候选，meta.empty 通常为 false。
    // 但 AI 可能判定都不相关（合法），所以只对有结果时验证结构。
    for (const item of result.data.items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.fullName).toBe("string");
      expect(typeof item.relation).toBe("string");
      expect(item.relation.length).toBeGreaterThan(0);
      // 目标仓库本身不应出现在结果中
      expect(item.id).not.toBe(REAL_ESRGAN_ID);
    }
  }, AI_TIMEOUT);
});
