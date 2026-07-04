// github-star.ts —— star_repo / unstar_repo 业务逻辑
// 职责：真正调用 GitHub 的 star/unstar API（不同于 updateRepoCuration 里 isFavorite 那种纯本地标记），
// 并让本地 starred_repos 保持和 GitHub 一致。

import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { starredRepos } from "../../db/schema";
import { getGitHubAccessToken, upsertSyncedRepo } from "../github/sync";
import {
  fetchGithubRepoMetadata,
  starRepoOnGithub,
  unstarRepoOnGithub,
} from "../github/client";
import { normalizeGitHubStarredRepo } from "../github/normalize";
import { getRepoDetail } from "./repository";

// 中文注释：UUID 格式校验——starred_repos.id 是 uuid 列，非 UUID 字符串直接进比较
// 会让 Postgres 抛 "invalid input syntax for type uuid"（同 analyze.ts 的 UUID_RE 约定）。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER_REPO_RE = /^[^\s/]+\/[^\s/]+$/;

export class GithubStarError extends Error {
  code: "not_found" | "invalid_input" | "forbidden_scope" | "upstream_error";

  constructor(code: GithubStarError["code"], message: string) {
    super(message);
    this.name = "GithubStarError";
    this.code = code;
  }
}

function splitOwnerRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

// 中文注释：403 是 star/unstar 接口最常见的失败原因——token 缺少 public_repo scope。
// 统一在这里转换成对 agent/用户可读的提示，而不是让原始 "status=403" 消息裸露出去。
function rethrowGithubMutationError(error: unknown, action: "star" | "unstar"): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("status=403")) {
    throw new GithubStarError(
      "forbidden_scope",
      `GitHub 授权缺少 public_repo 权限，无法${action === "star" ? "收藏" : "取消收藏"}。请退出重新登录 Starlens 以重新授权 GitHub。`,
    );
  }
  if (message.includes("status=404")) {
    throw new GithubStarError("not_found", `Repository was not found on GitHub.`);
  }
  throw new GithubStarError("upstream_error", message);
}

// 已在本地 starred_repos 中的仓库——按 UUID 或 fullName 精确匹配（不要求 isStarred，
// 允许对一个已经 unstarredAt 的历史行重新 star）。
async function findLocalRepoRow(userId: string, repoInput: string) {
  const db = getDb();

  if (UUID_RE.test(repoInput)) {
    const byId = await db.query.starredRepos.findFirst({
      where: and(eq(starredRepos.userId, userId), eq(starredRepos.id, repoInput)),
    });
    if (byId) return byId;
  }

  return db.query.starredRepos.findFirst({
    where: and(eq(starredRepos.userId, userId), eq(starredRepos.fullName, repoInput)),
  }) ?? null;
}

// ─── star_repo ──────────────────────────────────────────────────────────────

// 中文注释：repoInput 可以是：
// 1) "owner/repo" —— 任意公开仓库，哪怕之前从未收藏过；
// 2) 已存在的 Starlens id 或 fullName —— 典型场景是重新 star 一个之前 unstar 过的仓库。
export async function starRepoOnGithubForUser(userId: string, repoInput: string) {
  let owner: string;
  let repo: string;

  if (OWNER_REPO_RE.test(repoInput)) {
    ({ owner, repo } = splitOwnerRepo(repoInput));
  } else {
    const localRow = await findLocalRepoRow(userId, repoInput);
    if (!localRow) {
      throw new GithubStarError(
        "invalid_input",
        `"${repoInput}" is not a valid owner/repo, and no matching repo was found in your Starlens collection.`,
      );
    }
    owner = localRow.ownerLogin;
    repo = localRow.name;
  }

  const { token } = await getGitHubAccessToken(userId);

  try {
    await starRepoOnGithub(token, owner, repo);
  } catch (error) {
    rethrowGithubMutationError(error, "star");
  }

  // GitHub 的 GET /repos/{owner}/{repo} 不带 starred_at 字段——normalizeGitHubStarredRepo
  // 走的是无 "repo" 包裹的分支，starredAtGithub 会被置 null，这里手动补上当前时间。
  const meta = await fetchGithubRepoMetadata(token, owner, repo);
  const normalized = { ...normalizeGitHubStarredRepo(meta), starredAtGithub: new Date() };
  const repoId = await upsertSyncedRepo(userId, token, normalized);

  return getRepoDetail(userId, repoId);
}

// ─── unstar_repo ────────────────────────────────────────────────────────────

// 中文注释：只支持已经在本地 starred_repos 里的仓库——语义上和 favorite_star 等既有
// mutating 工具一致（repoInput 由 agent-tools 侧的 resolveRepo/patchRepo 语义解析而来）。
export async function unstarRepoOnGithubForUser(userId: string, repoInput: string) {
  const localRow = await findLocalRepoRow(userId, repoInput);

  if (!localRow) {
    throw new GithubStarError("not_found", `Repository was not found in your starred list: ${repoInput}`);
  }

  const { token } = await getGitHubAccessToken(userId);

  try {
    await unstarRepoOnGithub(token, localRow.ownerLogin, localRow.name);
  } catch (error) {
    rethrowGithubMutationError(error, "unstar");
  }

  const db = getDb();
  const now = new Date();
  await db
    .update(starredRepos)
    .set({ isStarred: false, unstarredAt: now, updatedAt: now })
    .where(and(eq(starredRepos.userId, userId), eq(starredRepos.id, localRow.id)));

  return getRepoDetail(userId, localRow.id);
}
