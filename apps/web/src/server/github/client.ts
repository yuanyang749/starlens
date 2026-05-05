import "server-only";

import { buildRepoSummary, extractReadmeExcerpt } from "@/server/repos/text";
import {
  normalizeGitHubStarredRepo,
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

export async function listAllStarredRepos(token: string) {
  const repos: NormalizedGitHubStarredRepo[] = [];
  let url: string | null =
    "https://api.github.com/user/starred?sort=created&direction=desc&per_page=100";

  while (url) {
    const response = await githubFetch(
      token,
      url,
      "application/vnd.github.star+json",
    );
    const page = (await response.json()) as GitHubStarredPayload[];
    repos.push(...page.map(normalizeGitHubStarredRepo));
    url = nextPageUrl(response.headers.get("link"));
  }

  return repos;
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
