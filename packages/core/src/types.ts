import type { RepoTextSource } from "./repo-text";

export type ProviderType =
  | "vercel_gateway"
  | "openai_compatible"
  | "anthropic_native"
  | "gemini_native";

export type RepoSummary = {
  id: string;
  githubRepoId: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  ownerAvatarUrl: string;
  htmlUrl: string;
  description: string;
  repoSummary: string;
  readmeExcerpt: string;
  aiSummary?: string;
  language: string;
  topics: string[];
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  defaultBranch: string;
  licenseName: string;
  license: {
    key: string;
    name: string;
  };
  visibility: "public" | "private" | "internal";
  archived: boolean;
  disabled: boolean;
  isFork: boolean;
  watchersCount: number;
  homepage: string;
  isFavorite: boolean;
  tags: string[];
  note: string;
  createdAtGithub: string;
  updatedAtGithub: string;
  pushedAtGithub: string;
  starredAtGithub: string;
  lastSyncedAt: string;
  repoSummarySource: RepoTextSource;
  repoSummaryUpdatedAt: string;
  readmeExcerptSource: RepoTextSource;
  readmeExcerptUpdatedAt: string;
  searchDocumentSource: RepoTextSource;
  searchDocumentUpdatedAt: string;
};

export type AiConfig = {
  id: string;
  displayName: string;
  providerType: ProviderType;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  isDefault: boolean;
  lastValidatedAt: string | null;
  lastValidationStatus: "success" | "warning" | "error" | null;
  lastValidationError: string | null;
};

export type TokenRecord = {
  id: string;
  name: string;
  note: string;
  tokenPrefix: string;
  tokenSuffix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type SearchSort = "relevance" | "recent" | "stars" | "updated";

export const SEARCH_SORTS = ["relevance", "recent", "stars", "updated"] as const;
export const DEFAULT_SEARCH_SORT: SearchSort = "recent";
export const DEFAULT_SEARCH_PAGE = 1;
export const DEFAULT_SEARCH_PAGE_SIZE = 20;
export const MAX_SEARCH_PAGE_SIZE = 100;

export type SearchReposInput = {
  q?: string;
  page?: number;
  pageSize?: number;
  language?: string;
  owner?: string;
  tag?: string;
  favorite?: boolean;
  sort?: SearchSort;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};
