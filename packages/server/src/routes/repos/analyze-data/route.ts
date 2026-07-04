// 数据版仓库分析路由入口（MCP / agent skill 场景）
// 职责：鉴权、参数校验、调用 resolveStarredRepo / fetchRepoFromGitHub 拉取原始数据
// 与 /api/ai/analyze 的区别：不调 AI（agent 自带模型，避免重复调用），不应用建议，
// 返回原始 README 摘要、topics、repoSummary 让 agent 自行分析。
// 无限流：纯数据端点不消耗 AI 配额。

import "server-only";

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { fetchRepoFromGitHub, resolveStarredRepo, type RepoSnapshot } from "@starlens/server/server/ai/analyze";

const MAX_REPO_INPUT_LENGTH = 200;

type SuggestedNextAction = { tool: string; args: Record<string, unknown>; reason: string };

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.repo !== "string" || !body.repo.trim()) {
    return fail("invalid_repo", "Repository (owner/repo or id) is required.");
  }

  const repo = body.repo.trim();
  if (repo.length > MAX_REPO_INPUT_LENGTH) {
    return fail("repo_too_long", `Repository must be ${MAX_REPO_INPUT_LENGTH} characters or fewer.`);
  }

  // applySuggestions 在数据端点无效——agent 应基于原始数据自行生成建议，
  // 通过 add_star_tag / set_star_note 工具应用。这里仅作参数兼容。
  // 不做任何写入操作。

  try {
    // 1. 解析仓库：先查本地 starred_repos，未命中再实时调 GitHub API。
    let snapshot: RepoSnapshot | null = await resolveStarredRepo(user.id, repo);
    let reasoningHints: string;

    if (snapshot) {
      reasoningHints = "已 star 仓库，基于本地存储的 README、topics 和 repoSummary。agent 可基于这些数据自行分析。";
    } else {
      // 输入可能是 owner/repo 也可能是已 unstar 的 id；这里只处理 owner/repo 形态的实时拉取。
      const parts = repo.split("/");
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        return fail(
          "repo_not_found",
          `Repository "${repo}" was not found in your starred list, and it is not a valid owner/repo for live fetch.`,
          404,
        );
      }
      const [owner, repoName] = parts.map((part: string) => part.trim());
      snapshot = await fetchRepoFromGitHub(user.id, owner, repoName);
      reasoningHints = "未 star 仓库，实时调用 GitHub API 拉取元数据和 README。结果不持久化，agent 自行分析。";
    }

    // 2. 构造 suggestedNextActions：建议 agent 调用 curation 工具（已 star）或引导用户先 star（未 star）。
    const suggestedNextActions: SuggestedNextAction[] = [];
    if (snapshot.isStarred && snapshot.id) {
      // 已 star：建议 agent 分析后通过 add_star_tag / set_star_note 应用——args 留空让 agent 填具体值
      suggestedNextActions.push({
        tool: "add_star_tag",
        args: { repo: snapshot.fullName },
        reason: "agent 分析后可基于 topics / README 自行生成标签并应用。",
      });
      suggestedNextActions.push({
        tool: "set_star_note",
        args: { repo: snapshot.fullName },
        reason: "agent 分析后可基于 README / description 生成备注并应用。",
      });
    } else {
      // 未 star：建议 agent 引导用户先 star（GitHub 上）后重新 sync_stars
      suggestedNextActions.push({
        tool: "sync_stars",
        args: {},
        reason: "若用户已在 GitHub star 该仓库，调用同步后即可应用标签和备注。",
      });
    }

    return ok({
      data: {
        repo: {
          id: snapshot.id,
          fullName: snapshot.fullName,
          description: snapshot.description,
          htmlUrl: snapshot.htmlUrl,
          stargazersCount: snapshot.stargazersCount,
          language: snapshot.language,
          topics: snapshot.topics,
          readmeExcerpt: snapshot.readmeExcerpt,
          repoSummary: snapshot.repoSummary,
        },
        isStarred: snapshot.isStarred,
        applied: false, // 数据端点永不应用建议
      },
      meta: { empty: false },
      suggestedNextActions,
      reasoningHints,
    });
  } catch (error) {
    // 复用 ai/analyze/route.ts 的错误分类——区分 repo_not_found、github_not_connected、其他 5xx。
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[routes/repos/analyze-data] fetch failed: userId=${user.id} repo=${repo} error=${msg}`);

    if (error instanceof Error && error.message.includes("was not found")) {
      return fail("repo_not_found", error.message, 404);
    }
    if (error instanceof Error && error.message.includes("GitHub account is not connected")) {
      return fail("github_not_connected", error.message, 422);
    }
    return fail("analyze_failed", msg, 500);
  }
}
