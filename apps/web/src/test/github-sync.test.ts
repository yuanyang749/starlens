import { describe, expect, it } from "vitest";
import { normalizeGitHubStarredRepo } from "@starlens/server/server/github/normalize";
import { findUnstarredRepoIds } from "@starlens/server/server/github/sync-utils";

describe("GitHub sync utilities", () => {
  it("normalizes star media responses with starred_at", () => {
    const repo = normalizeGitHubStarredRepo({
      starred_at: "2026-05-05T10:00:00Z",
      repo: {
        id: 123,
        name: "react-window",
        full_name: "bvaughn/react-window",
        owner: { login: "bvaughn", avatar_url: "https://example.com/avatar.png" },
        html_url: "https://github.com/bvaughn/react-window",
        description: "Render large lists efficiently.",
        topics: ["react", "virtualization"],
        language: "TypeScript",
        stargazers_count: 100,
        forks_count: 10,
        watchers_count: 100,
        open_issues_count: 1,
        default_branch: "master",
        homepage: null,
        license: { key: "mit", name: "MIT License" },
        archived: false,
        disabled: false,
        fork: false,
        private: false,
        visibility: "public",
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        pushed_at: "2026-05-02T00:00:00Z",
      },
    });

    expect(repo.githubRepoId).toBe(123);
    expect(repo.fullName).toBe("bvaughn/react-window");
    expect(repo.starredAtGithub?.toISOString()).toBe("2026-05-05T10:00:00.000Z");
    expect(repo.licenseName).toBe("MIT License");
  });

  it("finds unstarred repo ids without deleting notes or tags itself", () => {
    expect(findUnstarredRepoIds(["repo-1", "repo-2", "repo-3"], ["repo-2"])).toEqual([
      "repo-1",
      "repo-3",
    ]);
  });
});
