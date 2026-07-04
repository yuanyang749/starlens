// 数据版任务推荐路由入口（MCP / agent skill 场景）
// 职责：鉴权、参数校验、调用 hasStarredRepos / searchReposRanked 拉取原始候选
// 与 /api/ai/recommend 的区别：不调 AI 重排（agent 自带模型，避免重复调用），
// 直接返回 ts_rank 排序的候选 + 原始 repoSummary / tags / note 让 agent 自行判断相关性。
// 无限流：纯数据端点不消耗 AI 配额。

import "server-only";

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { hasStarredRepos } from "@starlens/server/server/ai/recommend";
import { searchReposRanked } from "@starlens/server/server/repos/repository";

const MAX_TASK_DESCRIPTION_LENGTH = 1000;
const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 10;

type SuggestedNextAction = { tool: string; args: Record<string, unknown>; reason: string };

type RecommendDataItem = {
  id: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  language: string;
  topics: string[];
  tags: string[];
  note: string;
  repoSummary: string;
  tsRank: number;
};

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.taskDescription !== "string" || !body.taskDescription.trim()) {
    return fail("invalid_task_description", "Task description is required.");
  }

  const taskDescription = body.taskDescription.trim();
  if (taskDescription.length > MAX_TASK_DESCRIPTION_LENGTH) {
    return fail("task_description_too_long", `Task description must be ${MAX_TASK_DESCRIPTION_LENGTH} characters or fewer.`);
  }

  // limit 校验：可选，整数 1-30，默认 10
  let limit: number = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || !Number.isInteger(body.limit)) {
      return fail("invalid_limit", "limit must be an integer.");
    }
    if (body.limit < 1 || body.limit > MAX_LIMIT) {
      return fail("invalid_limit", `limit must be between 1 and ${MAX_LIMIT}.`);
    }
    limit = body.limit;
  }

  try {
    // 1. 冷启动检测：用户未同步任何 star 时返回 empty: true。
    const hasRepos = await hasStarredRepos(user.id);
    if (!hasRepos) {
      return ok({
        data: { items: [] },
        meta: { empty: true, hint: "请先调用 sync_stars 同步你的 GitHub 收藏。" },
        suggestedNextActions: [
          { tool: "sync_stars", args: {}, reason: "同步后才能基于你的收藏进行任务推荐。" },
        ],
        reasoningHints: "用户尚未同步任何 GitHub 收藏，无法进行任务推荐。",
      });
    }

    // 2. 召回候选：直接调 searchReposRanked，limit 个即可（不乘 3，因为不做 AI 重排）。
    const candidates = await searchReposRanked(user.id, taskDescription, limit);

    if (candidates.length === 0) {
      return ok({
        data: { items: [] },
        meta: { empty: true, hint: "在你的收藏中没找到与该任务相关的仓库。" },
        suggestedNextActions: [],
        reasoningHints: `全文检索未召回任何仓库：taskDescription="${taskDescription.slice(0, 80)}"`,
      });
    }

    // 3. 组装结果——只挑选 agent 判断相关性需要的字段。
    const items: RecommendDataItem[] = candidates.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      description: c.description,
      htmlUrl: c.htmlUrl,
      stargazersCount: c.stargazersCount,
      language: c.language,
      topics: c.topics,
      tags: c.tags,
      note: c.note,
      repoSummary: c.repoSummary,
      tsRank: c.tsRank,
    }));

    // 4. suggestedNextActions：建议 agent 用 show_star 查看排名最高仓库的详情。
    const suggestedNextActions: SuggestedNextAction[] = [];
    if (items.length > 0) {
      suggestedNextActions.push({
        tool: "show_star",
        args: { repo: items[0].id },
        reason: "查看最相关仓库的详情（README、备注、标签等）以辅助决策。",
      });
    }

    const reasoningHints = `全文检索召回 ${candidates.length} 个候选，未做 AI 重排，由 agent 自行判断相关性。`;

    return ok({
      data: { items },
      meta: { empty: false },
      suggestedNextActions,
      reasoningHints,
    });
  } catch (error) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[routes/repos/recommend-data] failed: userId=${user.id} error=${msg}`);
    return fail("recommend_failed", msg, 500);
  }
}
