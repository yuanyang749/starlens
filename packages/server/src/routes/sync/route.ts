import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import {
  getSyncHistory,
  resolveSyncErrorLevel,
  syncGitHubStars,
  type SyncGitHubStarsResult,
} from "@starlens/server/server/github/sync";

function serializeResult(result: SyncGitHubStarsResult) {
  const finishedAt = result.finishedAt?.toISOString() ?? null;
  const durationMs = (result.finishedAt ?? new Date()).getTime() - result.startedAt.getTime();

  return {
    runId: result.runId,
    status: result.status,
    startedAt: result.startedAt.toISOString(),
    finishedAt,
    durationMs,
    nextPage: result.nextPage,
    pageCount: result.pageCount,
    failedCount: result.failedCount,
    errorSummary: result.errorSummary,
    errorLevel: result.errorLevel,
    counts: result.counts,
    continuation: {
      required: result.status === "running",
      // 每次 POST 只处理一页；客户端据此自动续跑，中断后下次 POST 会恢复同一 run。
      nextRequestAfterMs: result.status === "running" ? 150 : null,
    },
  };
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  try {
    const result = await syncGitHubStars(user.id);
    return ok({
      ...serializeResult(result),
      history: await getSyncHistory(user.id),
    });
  } catch (error) {
    // GitHub 账户尚未连接等错误发生在创建 sync_runs 之前，仍返回稳定的同步响应契约。
    const now = new Date();
    const errorSummary = error instanceof Error ? error.message : "Unknown sync error";
    return ok({
      runId: null,
      status: "error" as const,
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      durationMs: 0,
      nextPage: 1,
      pageCount: 0,
      failedCount: 1,
      errorSummary,
      errorLevel: resolveSyncErrorLevel(error),
      counts: { fetched: 0, insertedOrUpdated: 0, unstarred: 0 },
      continuation: { required: false, nextRequestAfterMs: null },
      history: await getSyncHistory(user.id).catch(() => []),
    });
  }
}

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const history = await getSyncHistory(user.id);
  return ok({ latest: history[0] ?? null, history });
}
