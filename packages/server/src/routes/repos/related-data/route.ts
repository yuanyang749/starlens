// 数据版关联仓库路由入口（MCP / agent skill 场景）
// 职责：鉴权、参数校验、调用 resolveTargetRepo + recallByOwner/Language/Topics 召回候选
// 与 /api/ai/related 的区别：不调 AI 重排（agent 自带模型，避免重复调用），
// 直接返回三维度召回的候选 + recallReasons 让 agent 自行判断关联性。
// 无限流：纯数据端点不消耗 AI 配额。

import "server-only";

import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import {
  recallByLanguage,
  recallByOwner,
  recallByTopics,
  resolveTargetRepo,
} from "@starlens/server/server/ai/related";

const MAX_REPO_INPUT_LENGTH = 200;
const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 10;

type SuggestedNextAction = { tool: string; args: Record<string, unknown>; reason: string };

type RelatedDataItem = {
  id: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  language: string;
  topics: string[];
  recallReasons: string[];
};

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
    // 1. 解析目标仓库——只在本地 starred_repos 中查找（关联仓库本来就只针对已收藏的）。
    const target = await resolveTargetRepo(user.id, repo);
    if (!target) {
      return ok({
        data: {
          target: null,
          items: [],
        },
        meta: { empty: true, hint: `未在你的收藏中找到仓库：${repo}` },
        suggestedNextActions: [],
        reasoningHints: "目标仓库未在 starred_repos 中找到，无法查找相关仓库。",
      });
    }

    // 2. 多维度召回候选——并行调用三个 recall 函数。
    const [byOwner, byLanguage, byTopics] = await Promise.all([
      recallByOwner(user.id, target.ownerLogin, target.id),
      recallByLanguage(user.id, target.language, target.id),
      recallByTopics(user.id, target.topics ?? [], target.id),
    ]);

    // 3. 去重并记录召回原因——按 owner → language → topics 顺序优先入队。
    const candidateMap = new Map<string, { row: typeof target; reasons: string[] }>();
    for (const row of byOwner) {
      const entry = candidateMap.get(row.id) ?? { row, reasons: [] };
      if (!entry.reasons.includes("同 owner")) entry.reasons.push("同 owner");
      candidateMap.set(row.id, entry);
    }
    for (const row of byLanguage) {
      const entry = candidateMap.get(row.id) ?? { row, reasons: [] };
      if (!entry.reasons.includes("同 language")) entry.reasons.push("同 language");
      candidateMap.set(row.id, entry);
    }
    for (const row of byTopics) {
      const entry = candidateMap.get(row.id) ?? { row, reasons: [] };
      if (!entry.reasons.includes("同 topic")) entry.reasons.push("同 topic");
      candidateMap.set(row.id, entry);
    }

    if (candidateMap.size === 0) {
      return ok({
        data: {
          target: {
            id: target.id,
            fullName: target.fullName,
            language: target.language ?? "",
            topics: target.topics ?? [],
            description: target.description ?? "",
          },
          items: [],
        },
        meta: { empty: true, hint: "未找到与目标仓库相关的其他收藏。" },
        suggestedNextActions: [],
        reasoningHints: `目标仓库 ${target.fullName} 的 owner/language/topics 维度均未召回到其他仓库。`,
      });
    }

    // 4. 按召回顺序组装结果（owner 优先、language 次之、topics 最后）——不做 AI 重排。
    const items: RelatedDataItem[] = Array.from(candidateMap.values())
      .slice(0, limit)
      .map(({ row, reasons }) => ({
        id: row.id,
        fullName: row.fullName,
        description: row.description ?? "",
        htmlUrl: row.htmlUrl,
        stargazersCount: row.stargazersCount,
        language: row.language ?? "",
        topics: row.topics ?? [],
        recallReasons: reasons,
      }));

    // 5. suggestedNextActions：建议 agent 用 show_star 查看最相关仓库的详情。
    const suggestedNextActions: SuggestedNextAction[] = [{
      tool: "show_star",
      args: { repo: items[0]!.id },
      reason: "查看最相关仓库的详情以确认是否真的相关。",
    }];

    const reasoningHints = `从 owner/language/topic 三维度召回 ${candidateMap.size} 个候选，未做 AI 重排，按召回顺序返回前 ${items.length} 个。`;

    return ok({
      data: {
        target: {
          id: target.id,
          fullName: target.fullName,
          language: target.language ?? "",
          topics: target.topics ?? [],
          description: target.description ?? "",
        },
        items,
      },
      meta: { empty: false },
      suggestedNextActions,
      reasoningHints,
    });
  } catch (error) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[routes/repos/related-data] failed: userId=${user.id} repo=${repo} error=${msg}`);
    return fail("related_failed", msg, 500);
  }
}
