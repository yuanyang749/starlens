import "server-only";

import { getDb } from "../../db/client";
import { aiUsageLogs } from "../../db/schema";

export type UsageEntry = {
  userId: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

// 中文注释：高水位触发立即刷库；低流量时定时兜底，避免长期滞留。
const FLUSH_SIZE = 20;
const FLUSH_INTERVAL_MS = 10_000;

let buffer: UsageEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  if (buffer.length === 0) return;
  const entries = buffer.splice(0);
  try {
    await getDb().insert(aiUsageLogs).values(entries);
  } catch {
    // usage 追踪是非关键路径，写库失败静默忽略，不影响主流程
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
}

// 中文注释：fire-and-forget，调用方无需 await，不阻塞 AI 响应链路。
export function trackAiUsage(entry: UsageEntry): void {
  buffer.push(entry);
  if (buffer.length >= FLUSH_SIZE) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    void flush();
  } else {
    scheduleFlush();
  }
}
