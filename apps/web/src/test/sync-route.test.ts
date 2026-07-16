import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getApiUserMock,
  getSyncHistoryMock,
  resolveSyncErrorLevelMock,
  syncGitHubStarsMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  getSyncHistoryMock: vi.fn(),
  resolveSyncErrorLevelMock: vi.fn(),
  syncGitHubStarsMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@starlens/server/server/github/sync", () => ({
  getSyncHistory: getSyncHistoryMock,
  resolveSyncErrorLevel: resolveSyncErrorLevelMock,
  syncGitHubStars: syncGitHubStarsMock,
}));

describe("sync API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "user-1" });
    getSyncHistoryMock.mockResolvedValue([]);
    resolveSyncErrorLevelMock.mockReturnValue("unknown");
  });

  it("returns a resumable running page and persisted history", async () => {
    const { POST } = await import("@/app/api/sync/route");
    syncGitHubStarsMock.mockResolvedValue({
      runId: "sync-1",
      status: "running",
      startedAt: new Date("2026-07-15T00:00:00.000Z"),
      finishedAt: null,
      nextPage: 2,
      pageCount: 1,
      failedCount: 0,
      errorSummary: null,
      errorLevel: null,
      counts: { fetched: 25, insertedOrUpdated: 25, unstarred: 0 },
    });
    getSyncHistoryMock.mockResolvedValue([
      {
        id: "sync-1",
        status: "running",
        startedAt: "2026-07-15T00:00:00.000Z",
        finishedAt: null,
        durationMs: null,
        pageCount: 1,
        failedCount: 0,
        errorSummary: null,
        errorLevel: null,
        counts: { fetched: 25, insertedOrUpdated: 25, unstarred: 0 },
      },
    ]);

    const response = await POST(new Request("https://starlens.test/api/sync", { method: "POST" }));

    expect(syncGitHubStarsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runId: "sync-1",
        status: "running",
        nextPage: 2,
        continuation: { required: true, nextRequestAfterMs: 150 },
        history: [{ id: "sync-1", status: "running" }],
      },
    });
  });

  it("lists the latest persisted run", async () => {
    const { GET } = await import("@/app/api/sync/route");
    getSyncHistoryMock.mockResolvedValue([{ id: "sync-1", status: "success" }]);

    const response = await GET(new Request("https://starlens.test/api/sync"));

    expect(getSyncHistoryMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { latest: { id: "sync-1", status: "success" } },
    });
  });
});
