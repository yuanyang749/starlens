// 限流状态查询的单元测试
// 中文注释：rate-limit.ts 用模块级 Map 维护 bucket，测试间用唯一 userId 隔离状态，
// 并用 fake timers 精确控制时间窗口，验证过期时间戳不计入 remaining 与 resetAt 计算。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getRateLimitStatus } from "./rate-limit";

describe("getRateLimitStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns full quota for user key when bucket is empty", () => {
    // 空 bucket：用户自有 Key 配额 20
    const status = getRateLimitStatus("user-empty-1", false);
    expect(status.remaining).toBe(20);
  });

  it("returns full quota for system key when bucket is empty", () => {
    // 空 bucket：系统共享 Key 配额 5（更严格）
    const status = getRateLimitStatus("user-empty-2", true);
    expect(status.remaining).toBe(5);
  });

  it("reports remaining = 20 - N after N checkRateLimit calls on user key", () => {
    // checkRateLimit 调用 N 次后，remaining 应递减为 20 - N
    const userId = "user-decay-1";
    for (let i = 0; i < 7; i++) {
      const result = checkRateLimit(userId, false);
      expect(result.allowed).toBe(true);
    }
    const status = getRateLimitStatus(userId, false);
    expect(status.remaining).toBe(20 - 7);
  });

  it("does not count expired timestamps toward remaining", () => {
    // 调用若干次后让时间前进超过 60s，过期时间戳应被清理，remaining 恢复满额
    const userId = "user-expire-1";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(userId, false);
    }
    // 窗口为 60s，前进 61s 让所有时间戳过期
    vi.advanceTimersByTime(61_000);
    const status = getRateLimitStatus(userId, false);
    expect(status.remaining).toBe(20);
  });

  it("reports resetAt = oldest timestamp + 60s when bucket has records", () => {
    // resetAt 应为窗口内最旧时间戳 + 60s
    const userId = "user-reset-1";
    const start = Date.now();
    checkRateLimit(userId, false);
    // 前进 10s 再调用一次，制造一个更新的时间戳
    vi.advanceTimersByTime(10_000);
    checkRateLimit(userId, false);

    const { resetAt } = getRateLimitStatus(userId, false);
    // 最旧时间戳是 start，resetAt 应为 start + 60s
    expect(resetAt).toBe(new Date(start + 60_000).toISOString());
  });

  it("reports resetAt = now when bucket is empty", () => {
    // 无记录时立即重置——resetAt 应为当前时间
    const now = Date.now();
    const { resetAt } = getRateLimitStatus("user-reset-empty-1", false);
    expect(resetAt).toBe(new Date(now).toISOString());
  });

  it("isolates user key and system key buckets", () => {
    // 同一用户两种 Key 应有独立 bucket
    const userId = "user-isolate-1";
    checkRateLimit(userId, false); // user key +1
    checkRateLimit(userId, true);  // system key +1
    expect(getRateLimitStatus(userId, false).remaining).toBe(19);
    expect(getRateLimitStatus(userId, true).remaining).toBe(4);
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks requests once user quota is exhausted", () => {
    // 用满 20 次后第 21 次应被拒绝
    const userId = "user-exhaust-1";
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(userId, false).allowed).toBe(true);
    }
    const blocked = checkRateLimit(userId, false);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("blocks requests once system quota is exhausted", () => {
    // 系统共享 Key 配额 5
    const userId = "user-exhaust-sys-1";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(userId, true).allowed).toBe(true);
    }
    expect(checkRateLimit(userId, true).allowed).toBe(false);
  });
});
