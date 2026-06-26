// AI 问答限流 — 横切关注点，独立于 ask 子域
// 中文注释：当前为进程内实现，多实例部署需迁移至持久化层（见架构优化方案 6.3）。

const RATE_LIMIT_USER_KEY_RPM = 20;  // 用户自有 API Key
const RATE_LIMIT_SYSTEM_KEY_RPM = 5; // 系统共享 Key（更严格）

const rateLimitBuckets = new Map<string, { timestamps: number[] }>();

export function checkRateLimit(
  userId: string,
  isSystemKey: boolean,
): { allowed: boolean; retryAfterSeconds: number } {
  const rpm = isSystemKey ? RATE_LIMIT_SYSTEM_KEY_RPM : RATE_LIMIT_USER_KEY_RPM;
  const key = `${userId}:${isSystemKey ? "sys" : "usr"}`;
  const now = Date.now();
  const windowMs = 60_000;

  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitBuckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= rpm) {
    const retryAfterSeconds = Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}
