import { mockAiConfigs } from "./ai-configs";
import { mockRepoDetails } from "./repos";
import { mockTokens } from "./tokens";
import type {
  AiConfig,
  PaginatedResult,
  RepoSummary,
  SearchReposInput,
  TokenRecord,
} from "../types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parsePage(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value) || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function scoreRepo(repo: RepoSummary, query: string) {
  if (!query) {
    return 0;
  }

  const fullName = normalize(repo.fullName);
  const summary = normalize(repo.repoSummary);
  const haystack = normalize(
    [
      repo.fullName,
      repo.ownerLogin,
      repo.description,
      repo.repoSummary,
      repo.readmeExcerpt,
      repo.note,
      repo.tags.join(" "),
      repo.topics.join(" "),
    ].join(" "),
  );

  let score = 0;
  if (fullName === query) score += 60;
  if (fullName.includes(query)) score += 35;
  if (summary.includes(query)) score += 20;
  if (haystack.includes(query)) score += 10;

  if (score > 0 && repo.isFavorite) score += 2;

  return score;
}

export function searchMockRepos(
  input: SearchReposInput = {},
): PaginatedResult<RepoSummary> {
  const page = parsePage(input.page, 1);
  const pageSize = Math.min(parsePage(input.pageSize, 20), 100);
  const query = normalize(input.q ?? "");

  const filtered = mockRepoDetails
    .filter((repo) => {
      if (input.favorite !== undefined && repo.isFavorite !== input.favorite) {
        return false;
      }

      if (input.language && normalize(repo.language) !== normalize(input.language)) {
        return false;
      }

      if (input.owner && normalize(repo.ownerLogin) !== normalize(input.owner)) {
        return false;
      }

      if (
        input.tag &&
        !repo.tags.some((tag) => normalize(tag) === normalize(input.tag ?? ""))
      ) {
        return false;
      }

      return !query || scoreRepo(repo, query) > 0;
    })
    .sort((a, b) => {
      if (input.sort === "stars") {
        return b.stargazersCount - a.stargazersCount;
      }

      if (input.sort === "recent") {
        return (
          new Date(b.starredAtGithub).getTime() -
          new Date(a.starredAtGithub).getTime()
        );
      }

      if (input.sort === "updated") {
        return (
          new Date(b.pushedAtGithub).getTime() -
          new Date(a.pushedAtGithub).getTime()
        );
      }

      return scoreRepo(b, query) - scoreRepo(a, query);
    });

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    page,
    pageSize,
    total: filtered.length,
    hasMore: start + pageSize < filtered.length,
  };
}

export function getMockRepo(id: string) {
  return mockRepoDetails.find((repo) => repo.id === id) ?? null;
}

export function patchMockRepo(
  id: string,
  updates: Pick<Partial<RepoSummary>, "isFavorite" | "note">,
) {
  const repo = getMockRepo(id);
  if (!repo) {
    return null;
  }

  return {
    ...repo,
    ...updates,
  };
}

export function addMockRepoTag(id: string, tag: string) {
  const repo = getMockRepo(id);
  if (!repo) {
    return null;
  }

  const tags = Array.from(new Set([...repo.tags, normalize(tag)])).filter(Boolean);
  return { tags };
}

export function deleteMockRepoTag(id: string, tag: string) {
  const repo = getMockRepo(id);
  if (!repo) {
    return null;
  }

  return {
    tags: repo.tags.filter((value) => normalize(value) !== normalize(tag)),
  };
}

export function listMockTokens(): TokenRecord[] {
  return mockTokens;
}

export function createMockToken(name: string, note = "") {
  const createdAt = new Date().toISOString();
  const tokenPrefix = "stl_mock";
  const tokenSuffix = "d_once";

  return {
    token: `${tokenPrefix}_generated_once`,
    tokenMeta: {
      id: "token-new",
      name,
      note,
      tokenPrefix,
      tokenSuffix,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt,
    } satisfies TokenRecord,
  };
}

export function listMockAiConfigs(): AiConfig[] {
  return mockAiConfigs;
}

export function getMockAiConfig(id: string) {
  return mockAiConfigs.find((config) => config.id === id) ?? null;
}

export function patchMockAiConfig(id: string, updates: Partial<AiConfig>) {
  const config = getMockAiConfig(id);
  if (!config) {
    return null;
  }

  return {
    ...config,
    ...updates,
  };
}
