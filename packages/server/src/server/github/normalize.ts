export type GitHubRepoPayload = {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url?: string | null;
  };
  html_url: string;
  description?: string | null;
  topics?: string[];
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
  default_branch?: string | null;
  homepage?: string | null;
  license?: {
    key?: string | null;
    name?: string | null;
  } | null;
  archived?: boolean;
  disabled?: boolean;
  fork?: boolean;
  private?: boolean;
  visibility?: string;
  created_at?: string | null;
  updated_at?: string | null;
  pushed_at?: string | null;
};

export type GitHubStarredPayload =
  | GitHubRepoPayload
  | {
      starred_at?: string | null;
      repo: GitHubRepoPayload;
    };

export type NormalizedGitHubStarredRepo = {
  githubRepoId: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  ownerAvatarUrl: string | null;
  htmlUrl: string;
  description: string | null;
  topics: string[];
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  defaultBranch: string | null;
  homepage: string | null;
  licenseKey: string | null;
  licenseName: string | null;
  archived: boolean;
  disabled: boolean;
  isFork: boolean;
  isPrivate: boolean;
  visibility: string;
  createdAtGithub: Date | null;
  updatedAtGithub: Date | null;
  pushedAtGithub: Date | null;
  starredAtGithub: Date | null;
};

function dateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

export function normalizeGitHubStarredRepo(
  payload: GitHubStarredPayload,
): NormalizedGitHubStarredRepo {
  const repo = "repo" in payload ? payload.repo : payload;
  const starredAt = "repo" in payload ? payload.starred_at : null;

  return {
    githubRepoId: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    ownerLogin: repo.owner.login,
    ownerAvatarUrl: repo.owner.avatar_url ?? null,
    htmlUrl: repo.html_url,
    description: repo.description ?? null,
    topics: repo.topics ?? [],
    language: repo.language ?? null,
    stargazersCount: repo.stargazers_count ?? 0,
    forksCount: repo.forks_count ?? 0,
    watchersCount: repo.watchers_count ?? 0,
    openIssuesCount: repo.open_issues_count ?? 0,
    defaultBranch: repo.default_branch ?? null,
    homepage: repo.homepage ?? null,
    licenseKey: repo.license?.key ?? null,
    licenseName: repo.license?.name ?? null,
    archived: repo.archived ?? false,
    disabled: repo.disabled ?? false,
    isFork: repo.fork ?? false,
    isPrivate: repo.private ?? false,
    visibility: repo.visibility ?? (repo.private ? "private" : "public"),
    createdAtGithub: dateOrNull(repo.created_at),
    updatedAtGithub: dateOrNull(repo.updated_at),
    pushedAtGithub: dateOrNull(repo.pushed_at),
    starredAtGithub: dateOrNull(starredAt),
  };
}
