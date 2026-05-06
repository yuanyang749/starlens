import { ok, unauthorized } from "@/lib/api-response";
import { getSessionUser } from "@/server/auth/session";
import {
  addSyncHistory,
  getSyncHistory,
  resolveSyncErrorLevel,
  syncGitHubStars,
} from "@/server/github/sync";

export async function POST() {
  const user = await getSessionUser();

  if (!user) {
    return unauthorized();
  }

  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const result = await syncGitHubStars(user.id);
    const finishedAt = new Date().toISOString();
    const durationMs = new Date(finishedAt).getTime() - startedAtDate.getTime();
    const historyEntry = {
      startedAt,
      finishedAt,
      durationMs,
      pageCount: result.pageCount,
      failedCount: result.failedCount,
      errorSummary: null,
      status: "success" as const,
      counts: result.counts,
      errorLevel: null,
    };
    addSyncHistory(user.id, historyEntry);

    return ok({
      ...historyEntry,
      history: getSyncHistory(user.id),
      // Feature flag / schedule hook: FUTURE_ENABLE_SYNC_CRON=true
      scheduler: {
        enabled: false,
        trigger: "cron every 30 minutes",
        retryPolicy: "up to 3 retries with exponential backoff (30s, 2m, 10m)",
      },
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = new Date(finishedAt).getTime() - startedAtDate.getTime();
    const errorSummary = error instanceof Error ? error.message : "Unknown sync error";
    const errorLevel = resolveSyncErrorLevel(error);
    const historyEntry = {
      startedAt,
      finishedAt,
      durationMs,
      pageCount: 0,
      failedCount: 1,
      errorSummary,
      status: "error" as const,
      counts: { fetched: 0, insertedOrUpdated: 0, unstarred: 0 },
      errorLevel,
    };
    addSyncHistory(user.id, historyEntry);

    return ok({
      ...historyEntry,
      history: getSyncHistory(user.id),
      scheduler: {
        enabled: false,
        trigger: "cron every 30 minutes",
        retryPolicy: "up to 3 retries with exponential backoff (30s, 2m, 10m)",
      },
    });
  }
}
