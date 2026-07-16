import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRepoStatsMock, getSessionUserMock } = vi.hoisted(() => ({
  getRepoStatsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/session", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@starlens/server/server/repos/repository", () => ({
  getRepoStats: getRepoStatsMock,
}));

describe("stats API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue({ id: "user-1" });
    getRepoStatsMock.mockResolvedValue({ total: 0 });
  });

  it("forwards a supported attention reason to the repository query", async () => {
    const { GET } = await import("@/app/api/stats/route");

    await GET(new Request("https://starlens.test/api/stats?attention=stale"));

    expect(getRepoStatsMock).toHaveBeenCalledWith("user-1", { attentionFilter: "stale" });
  });

  it("does not forward unsupported attention reasons", async () => {
    const { GET } = await import("@/app/api/stats/route");

    await GET(new Request("https://starlens.test/api/stats?attention=invalid"));

    expect(getRepoStatsMock).toHaveBeenCalledWith("user-1", { attentionFilter: undefined });
  });
});
