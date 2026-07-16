import "server-only";

import { buildRepoSummary, extractReadmeExcerpt } from "@starlens-app/core";
import {
  normalizeGitHubStarredRepo,
  type GitHubRepoPayload,
  type GitHubStarredPayload,
  type NormalizedGitHubStarredRepo,
} from "./normalize";

function nextPageUrl(linkHeader: string | null) {
  if (!linkHeader) {
    return null;
  }

  const match = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.endsWith('rel="next"'))
    ?.match(/<([^>]+)>/);

  return match?.[1] ?? null;
}

async function githubFetch(token: string, url: string, accept: string) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status}`);
  }

  return response;
}

export type StarredReposPage = {
  repos: NormalizedGitHubStarredRepo[];
  hasNextPage: boolean;
};

// 首次同步按页处理，而不是先把全部收藏拉到内存再逐个写库。
// 单页结果可以安全重试；由 sync_runs.next_page 持久化断点。
export async function listStarredReposPage(
  token: string,
  page: number,
  perPage = 50,
): Promise<StarredReposPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePerPage = Math.min(100, Math.max(1, Math.floor(perPage)));
  const url = new URL("https://api.github.com/user/starred");
  url.searchParams.set("sort", "created");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", String(safePerPage));
  url.searchParams.set("page", String(safePage));

  const response = await githubFetch(
    token,
    url.toString(),
    "application/vnd.github.star+json",
  );
  const repos = ((await response.json()) as GitHubStarredPayload[]).map(normalizeGitHubStarredRepo);

  return {
    repos,
    hasNextPage: Boolean(nextPageUrl(response.headers.get("link"))),
  };
}

export async function listAllStarredRepos(token: string) {
  const repos: NormalizedGitHubStarredRepo[] = [];
  let pages = 0;
  let url: string | null =
    "https://api.github.com/user/starred?sort=created&direction=desc&per_page=100";

  while (url) {
    pages += 1;
    const response = await githubFetch(
      token,
      url,
      "application/vnd.github.star+json",
    );
    const page = (await response.json()) as GitHubStarredPayload[];
    repos.push(...page.map(normalizeGitHubStarredRepo));
    url = nextPageUrl(response.headers.get("link"));
  }

  return {
    repos,
    pages,
  };
}

// 中文注释：Star/Unstar 需要 OAuth token 带 public_repo scope（见 packages/server/src/auth.ts）。
// GitHub 对这两个接口返回 204 No Content 且天然幂等——重复 star 已 star 的仓库、
// 或 unstar 已经不是 star 的仓库都会正常返回 204，不会报错。
async function githubStarMutation(
  token: string,
  method: "PUT" | "DELETE",
  owner: string,
  repo: string,
) {
  const response = await fetch(`https://api.github.com/user/starred/${owner}/${repo}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Length": "0",
    },
  });

  if (!response.ok) {
    // 状态码透传给上层——403 通常意味着 token 缺少 public_repo scope，404 意味着仓库不存在。
    throw new Error(`GitHub ${method} star request failed: status=${response.status} repo=${owner}/${repo}`);
  }
}

export function starRepoOnGithub(token: string, owner: string, repo: string) {
  return githubStarMutation(token, "PUT", owner, repo);
}

export function unstarRepoOnGithub(token: string, owner: string, repo: string) {
  return githubStarMutation(token, "DELETE", owner, repo);
}

// 中文注释：从 analyze.ts 抽出来的共享实现——两处都需要给"未 star/未知"的 owner/repo
// 实时拉取 GitHub 仓库元数据（analyze_repo 分析未 star 仓库、star_repo 收藏全新仓库）。
export async function fetchGithubRepoMetadata(token: string, owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const status = response.status;
    const msg = `GitHub repo metadata fetch failed: status=${status} repo=${owner}/${repo}`;
    throw new Error(status === 404 ? `Repository ${owner}/${repo} was not found on GitHub.` : msg);
  }

  return (await response.json()) as GitHubRepoPayload;
}

export async function fetchReadmeExcerpt(token: string, owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    return "";
  }

  if (!response.ok) {
    throw new Error(`GitHub README request failed: ${response.status}`);
  }

  return extractReadmeExcerpt(await response.text());
}

export function summarizeSyncedRepo(input: {
  description?: string | null;
  topics?: string[];
  readmeExcerpt?: string | null;
  fullName?: string;
}) {
  return buildRepoSummary(input);
}
