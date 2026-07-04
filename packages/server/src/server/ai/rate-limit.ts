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

// 中文注释：返回当前限流窗口内的剩余配额和窗口结束时间，供主动型工具在
// 响应体的 meta.rateLimit 字段透传给 agent，便于 agent 收敛调用频率。
// 与 checkRateLimit 共享同一份 bucket，但不计入新的请求——用于在已通过限流后
// 报告"还能调多少次"和"何时重置"。
export function getRateLimitStatus(
  userId: string,
  isSystemKey: boolean,
): { remaining: number; resetAt: string } {
  const rpm = isSystemKey ? RATE_LIMIT_SYSTEM_KEY_RPM : RATE_LIMIT_USER_KEY_RPM;
  const key = `${userId}:${isSystemKey ? "sys" : "usr"}`;
  const now = Date.now();
  const windowMs = 60_000;

  const bucket = rateLimitBuckets.get(key);
  const timestamps = (bucket?.timestamps ?? []).filter((ts) => now - ts < windowMs);

  const remaining = Math.max(0, rpm - timestamps.length);
  // 窗口内最旧的时间戳 + 60s 即为下一次重置时间；若无记录则立即重置。
  const resetAt = timestamps.length > 0
    ? new Date(timestamps[0] + windowMs).toISOString()
    : new Date(now).toISOString();

  return { remaining, resetAt };
}
