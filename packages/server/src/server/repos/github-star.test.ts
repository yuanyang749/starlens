// star_repo / unstar_repo 业务逻辑单元测试
// 中文注释：mock 掉 DB 客户端和所有 GitHub API 调用点，只验证 github-star.ts 自身的
// owner/repo 解析、错误包装（403→forbidden_scope、404→not_found）逻辑。
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, updateMock, setMock, whereMock } = vi.hoisted(() => {
  const whereMock = vi.fn(async () => undefined);
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return { findFirstMock: vi.fn(), updateMock, setMock, whereMock };
});

vi.mock("../../db/client", () => ({
  getDb: vi.fn(() => ({
    query: { starredRepos: { findFirst: findFirstMock } },
    update: updateMock,
  })),
}));

const { getGitHubAccessTokenMock, upsertSyncedRepoMock } = vi.hoisted(() => ({
  getGitHubAccessTokenMock: vi.fn(async () => ({ token: "gh-token", account: {} })),
  upsertSyncedRepoMock: vi.fn(async () => "new-repo-id"),
}));

vi.mock("../github/sync", () => ({
  getGitHubAccessToken: getGitHubAccessTokenMock,
  upsertSyncedRepo: upsertSyncedRepoMock,
}));

const { starRepoOnGithubMock, unstarRepoOnGithubMock, fetchGithubRepoMetadataMock } = vi.hoisted(() => ({
  starRepoOnGithubMock: vi.fn(async () => undefined),
  unstarRepoOnGithubMock: vi.fn(async () => undefined),
  fetchGithubRepoMetadataMock: vi.fn(async () => ({
    id: 1,
    name: "repo",
    full_name: "owner/repo",
    owner: { login: "owner" },
    html_url: "https://github.com/owner/repo",
  })),
}));

vi.mock("../github/client", () => ({
  starRepoOnGithub: starRepoOnGithubMock,
  unstarRepoOnGithub: unstarRepoOnGithubMock,
  fetchGithubRepoMetadata: fetchGithubRepoMetadataMock,
}));

const { getRepoDetailMock } = vi.hoisted(() => ({
  getRepoDetailMock: vi.fn(async () => ({ id: "new-repo-id", fullName: "owner/repo" })),
}));

vi.mock("./repository", () => ({
  getRepoDetail: getRepoDetailMock,
}));

async function loadModule() {
  return await import("./github-star");
}

describe("starRepoOnGithubForUser", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    updateMock.mockClear();
    setMock.mockClear();
    whereMock.mockClear();
    getGitHubAccessTokenMock.mockClear();
    upsertSyncedRepoMock.mockClear();
    starRepoOnGithubMock.mockClear();
    fetchGithubRepoMetadataMock.mockClear();
    getRepoDetailMock.mockClear();
  });

  it("stars a repo given a raw owner/repo string without any local lookup", async () => {
    const { starRepoOnGithubForUser } = await loadModule();

    const result = await starRepoOnGithubForUser("user-1", "owner/repo");

    expect(findFirstMock).not.toHaveBeenCalled();
    expect(starRepoOnGithubMock).toHaveBeenCalledWith("gh-token", "owner", "repo");
    expect(upsertSyncedRepoMock).toHaveBeenCalledWith(
      "user-1",
      "gh-token",
      expect.objectContaining({ fullName: "owner/repo", starredAtGithub: expect.any(Date) }),
    );
    expect(result).toEqual({ id: "new-repo-id", fullName: "owner/repo" });
  });

  it("resolves a Starlens id to its owner/name before starring", async () => {
    findFirstMock.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      ownerLogin: "owner",
      name: "repo",
    });
    const { starRepoOnGithubForUser } = await loadModule();

    await starRepoOnGithubForUser("user-1", "11111111-1111-1111-1111-111111111111");

    expect(starRepoOnGithubMock).toHaveBeenCalledWith("gh-token", "owner", "repo");
  });

  it("throws invalid_input when the input is neither owner/repo nor a known local repo", async () => {
    findFirstMock.mockResolvedValue(undefined);
    const { starRepoOnGithubForUser, GithubStarError } = await loadModule();

    await expect(starRepoOnGithubForUser("user-1", "not-a-repo-reference")).rejects.toMatchObject({
      code: "invalid_input" satisfies GithubStarError["code"],
    });
  });

  it("wraps a 403 GitHub response into forbidden_scope", async () => {
    starRepoOnGithubMock.mockRejectedValueOnce(new Error("GitHub PUT star request failed: status=403 repo=owner/repo"));
    const { starRepoOnGithubForUser } = await loadModule();

    await expect(starRepoOnGithubForUser("user-1", "owner/repo")).rejects.toMatchObject({
      code: "forbidden_scope",
    });
  });

  it("wraps a 404 GitHub response into not_found", async () => {
    starRepoOnGithubMock.mockRejectedValueOnce(new Error("GitHub PUT star request failed: status=404 repo=owner/repo"));
    const { starRepoOnGithubForUser } = await loadModule();

    await expect(starRepoOnGithubForUser("user-1", "owner/repo")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("unstarRepoOnGithubForUser", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    updateMock.mockClear();
    setMock.mockClear();
    whereMock.mockClear();
    getGitHubAccessTokenMock.mockClear();
    unstarRepoOnGithubMock.mockClear();
    getRepoDetailMock.mockClear();
  });

  it("throws not_found when the repo isn't in the local collection", async () => {
    findFirstMock.mockResolvedValue(undefined);
    const { unstarRepoOnGithubForUser } = await loadModule();

    await expect(unstarRepoOnGithubForUser("user-1", "owner/repo")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(unstarRepoOnGithubMock).not.toHaveBeenCalled();
  });

  it("unstars a known local repo and marks it isStarred=false locally", async () => {
    findFirstMock.mockResolvedValue({ id: "repo-1", ownerLogin: "owner", name: "repo" });
    const { unstarRepoOnGithubForUser } = await loadModule();

    await unstarRepoOnGithubForUser("user-1", "owner/repo");

    expect(unstarRepoOnGithubMock).toHaveBeenCalledWith("gh-token", "owner", "repo");
    expect(updateMock).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ isStarred: false, unstarredAt: expect.any(Date) }),
    );
  });

  it("wraps a 403 GitHub response into forbidden_scope", async () => {
    findFirstMock.mockResolvedValue({ id: "repo-1", ownerLogin: "owner", name: "repo" });
    unstarRepoOnGithubMock.mockRejectedValueOnce(new Error("GitHub DELETE star request failed: status=403 repo=owner/repo"));
    const { unstarRepoOnGithubForUser } = await loadModule();

    await expect(unstarRepoOnGithubForUser("user-1", "owner/repo")).rejects.toMatchObject({
      code: "forbidden_scope",
    });
  });
});
