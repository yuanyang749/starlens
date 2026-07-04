// analyze_repo 业务逻辑 —— 仓库分析+智能标注（spec 第 6.1.5 节）
// 职责：解析目标仓库（已 star 走本地、未 star 走 GitHub API 实时拉取），
// 调用 AI 生成 summary/suitableFor/suggestedTags/suggestedNote，
// 可选地通过 addRepoTag/updateRepoCuration 应用建议（仅对已 star 仓库）。

import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { starredRepos } from "../../db/schema";
import { addRepoTag, updateRepoCuration } from "../repos/repository";
import { getGitHubAccessToken } from "../github/sync";
import { fetchReadmeExcerpt, summarizeSyncedRepo } from "../github/client";
import { callChatCompletionsWithTools, stripThinkBlocks, type AgentChatMessage } from "./ask/provider";
import type { ChatRuntimeConfig } from "./ask/types";

// 中文注释：未 star 仓库的 analyze 结果不持久化（spec 第 6.3 节隐私边界）——
// 仅在内存中生成建议返回给 agent，由 agent 引导用户先 star 再应用。

export type AnalyzeRepoInput = {
  repo: string;           // owner/repo 或 starred_repos.id
  applySuggestions: boolean;
};

export type AnalyzeRepoResult = {
  data: {
    repo: {
      id: string | null;
      fullName: string;
      description: string;
      htmlUrl: string;
      stargazersCount: number;
      language: string;
      topics: string[];
    };
    summary: string;
    suitableFor: string;
    suggestedTags: string[];
    suggestedNote: string;
    isStarred: boolean;
    applied: boolean;
    hint?: string;
  };
  meta: { empty: false };
  suggestedNextActions: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
  reasoningHints: string;
};

// ─── 仓库解析 ───────────────────────────────────────────────────────────────

/** @internal 仓库快照——测试可见，不是公共 API */
export type RepoSnapshot = {
  id: string | null;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  language: string;
  topics: string[];
  readmeExcerpt: string;
  repoSummary: string;
  isStarred: boolean;
};

// 解析 owner/repo 或 id：先按 id 在 starred_repos 中精确查找，再按 fullName 模糊匹配。
async function resolveStarredRepo(userId: string, repo: string): Promise<RepoSnapshot | null> {
  const db = getDb();

  // 按 id 精确匹配
  const byId = await db.query.starredRepos.findFirst({
    where: and(eq(starredRepos.userId, userId), eq(starredRepos.id, repo)),
  });
  if (byId && byId.isStarred) {
    return toSnapshot(byId);
  }

  // 按 fullName 匹配
  const byFullName = await db.query.starredRepos.findFirst({
    where: and(eq(starredRepos.userId, userId), eq(starredRepos.fullName, repo)),
  });
  if (byFullName && byFullName.isStarred) {
    return toSnapshot(byFullName);
  }

  return null;
}

function toSnapshot(row: typeof starredRepos.$inferSelect): RepoSnapshot {
  return {
    id: row.id,
    fullName: row.fullName,
    description: row.description ?? "",
    htmlUrl: row.htmlUrl,
    stargazersCount: row.stargazersCount,
    language: row.language ?? "",
    topics: row.topics ?? [],
    readmeExcerpt: row.readmeExcerpt ?? "",
    repoSummary: row.repoSummary ?? "",
    isStarred: true,
  };
}

// 实时调 GitHub API 拉取未 star 仓库的元数据 + README。
async function fetchRepoFromGitHub(userId: string, owner: string, repo: string): Promise<RepoSnapshot> {
  const { token } = await getGitHubAccessToken(userId);

  const metaResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!metaResponse.ok) {
    const status = metaResponse.status;
    const msg = `GitHub repo metadata fetch failed: status=${status} repo=${owner}/${repo}`;
    console.warn(`[ai/analyze] ${msg}`);
    throw new Error(status === 404 ? `Repository ${owner}/${repo} was not found on GitHub.` : msg);
  }

  const meta = await metaResponse.json() as {
    full_name: string;
    html_url: string;
    description?: string | null;
    topics?: string[];
    language?: string | null;
    stargazers_count?: number;
  };

  const readmeExcerpt = await fetchReadmeExcerpt(token, owner, repo).catch((error: unknown) => {
    // README 拉取失败不致命——空 readme 会让 repoSummary 质量下降，但分析仍可继续。
    const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/analyze] fetchReadmeExcerpt failed: owner=${owner} repo=${repo} error=${errMsg}`);
    return "";
  });

  const fullName = meta.full_name ?? `${owner}/${repo}`;
  const description = meta.description ?? "";
  const topics = meta.topics ?? [];
  const repoSummary = summarizeSyncedRepo({ description, topics, readmeExcerpt, fullName });

  return {
    id: null,
    fullName,
    description,
    htmlUrl: meta.html_url ?? `https://github.com/${owner}/${repo}`,
    stargazersCount: meta.stargazers_count ?? 0,
    language: meta.language ?? "",
    topics,
    readmeExcerpt,
    repoSummary,
    isStarred: false,
  };
}

// ─── AI 分析 ────────────────────────────────────────────────────────────────

/** @internal 测试可见，不是公共 API */
export function buildAnalyzeSystemPrompt(): string {
  return `你是 Starlens 的仓库分析助手。基于仓库的 fullName、description、topics、README 摘录、repoSummary、language、star 数，输出对仓库的分析。

严格规则：
- 只能基于输入的真实数据推断，绝对不能编造不存在的特性或场景
- 必须返回 JSON，字段：summary（一句话总结仓库是什么）、suitableFor（适用场景描述，2-3 句）、suggestedTags（建议标签数组，小写英文，最多 5 个）、suggestedNote（建议备注，1 句中文，告诉用户为什么这个仓库值得收藏）
- 不要包含任何 JSON 之外的文字、不要包裹 markdown code fence
- 标签优先从 topics 中复用；只有在 topics 完全不能覆盖仓库的某个明显特征时才新增
- 如果数据不足以判断 suitableFor 或 suggestedNote，返回空字符串而不是编造`;
}

/** @internal 测试可见，不是公共 API */
export function buildAnalyzeUserPrompt(snapshot: RepoSnapshot): string {
  const lines = [
    `仓库：${snapshot.fullName}`,
    `Stars: ${snapshot.stargazersCount}`,
    `语言: ${snapshot.language || "unknown"}`,
    `主页: ${snapshot.htmlUrl}`,
  ];
  if (snapshot.description) lines.push(`简介: ${snapshot.description}`);
  if (snapshot.repoSummary) lines.push(`摘要: ${snapshot.repoSummary}`);
  if (snapshot.readmeExcerpt) {
    // README 摘录较长时截断，避免 prompt 超过模型上下文限制。
    lines.push(`README 摘录:\n${snapshot.readmeExcerpt.slice(0, 1500)}`);
  }
  if (snapshot.topics.length > 0) lines.push(`Topics: ${snapshot.topics.join(", ")}`);
  return lines.join("\n");
}

/** @internal AI 输出结构——测试可见，不是公共 API */
export type AiAnalyzeOutput = {
  summary: string;
  suitableFor: string;
  suggestedTags: string[];
  suggestedNote: string;
};

/** @internal 测试可见，不是公共 API */
export function parseAiOutput(raw: string | null, fallback: RepoSnapshot): AiAnalyzeOutput {
  if (!raw) {
    return {
      summary: fallback.repoSummary || fallback.description || fallback.fullName,
      suitableFor: "",
      suggestedTags: [],
      suggestedNote: "",
    };
  }

  const cleaned = stripThinkBlocks(raw).trim();
  // 容错：AI 偶尔会用 ```json ... ``` 包裹结果，剥离 code fence。
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : cleaned;

  try {
    const parsed = JSON.parse(jsonText) as Partial<AiAnalyzeOutput>;
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : fallback.repoSummary || fallback.description || fallback.fullName,
      suitableFor: typeof parsed.suitableFor === "string" ? parsed.suitableFor.trim() : "",
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags
            .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
            .map((tag) => tag.trim().toLowerCase())
            .slice(0, 5)
        : [],
      suggestedNote: typeof parsed.suggestedNote === "string" ? parsed.suggestedNote.trim() : "",
    };
  } catch (error) {
    // AI 返回非 JSON 时降级为只用 repoSummary，suggestedTags/Note 为空——
    // 不抛错，让上层仍然能返回基础信息。
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`[ai/analyze] AI output JSON parse failed: error=${msg} raw=${cleaned.slice(0, 200)}`);
    return {
      summary: fallback.repoSummary || fallback.description || fallback.fullName,
      suitableFor: "",
      suggestedTags: [],
      suggestedNote: "",
    };
  }
}

// ─── 建议应用 ────────────────────────────────────────────────────────────────

// applySuggestions=true 且已 star：调用 addRepoTag + updateRepoCuration 应用建议。
// 单个 tag 应用失败不致命——记录原因后继续应用其他 tag，最大化用户感知到的成功。
/** @internal 测试可见，不是公共 API */
export async function applySuggestionsToStarredRepo(
  userId: string,
  repoId: string,
  suggestions: AiAnalyzeOutput,
): Promise<boolean> {
  let allApplied = true;

  for (const tag of suggestions.suggestedTags) {
    try {
      const result = await addRepoTag(userId, repoId, tag);
      if (!result) {
        allApplied = false;
        console.warn(`[ai/analyze] addRepoTag returned null: userId=${userId} repoId=${repoId} tag=${tag}`);
      }
    } catch (error) {
      allApplied = false;
      const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.warn(`[ai/analyze] addRepoTag failed: userId=${userId} repoId=${repoId} tag=${tag} error=${msg}`);
    }
  }

  if (suggestions.suggestedNote) {
    try {
      const result = await updateRepoCuration(userId, repoId, { note: suggestions.suggestedNote });
      if (!result) {
        allApplied = false;
        console.warn(`[ai/analyze] updateRepoCuration returned null: userId=${userId} repoId=${repoId}`);
      }
    } catch (error) {
      allApplied = false;
      const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.warn(`[ai/analyze] updateRepoCuration failed: userId=${userId} repoId=${repoId} error=${msg}`);
    }
  }

  return allApplied;
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

// 中文注释：analyze_repo 不需要冷启动检测（spec 第 9.3 节）——未 star 仓库也能分析。
// 返回结构包含 data / meta / suggestedNextActions / reasoningHints 四段（spec 第 7 节）。
export async function analyzeRepo(
  userId: string,
  input: AnalyzeRepoInput,
  chatConfig: ChatRuntimeConfig,
): Promise<AnalyzeRepoResult> {
  // 1. 解析仓库：先查本地 starred_repos，未命中再实时调 GitHub API。
  let snapshot = await resolveStarredRepo(userId, input.repo);
  let reasoningHints: string;

  if (snapshot) {
    reasoningHints = "已 star 仓库，基于本地存储的 README、topics 和 repoSummary 进行分析。";
  } else {
    // 输入可能是 owner/repo 也可能是已 unstar 的 id；这里只处理 owner/repo 形态的实时拉取。
    const parts = input.repo.split("/");
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      throw new Error(`Repository "${input.repo}" was not found in your starred list, and it is not a valid owner/repo for live analysis.`);
    }
    const [owner, repo] = parts.map((part) => part.trim());
    snapshot = await fetchRepoFromGitHub(userId, owner, repo);
    reasoningHints = "未 star 仓库，实时调用 GitHub API 拉取元数据和 README 进行分析。结果不持久化。";
  }

  // 2. 调用 AI 生成分析（普通 chat completion，不使用 tool calling）。
  const messages: AgentChatMessage[] = [
    { role: "system", content: buildAnalyzeSystemPrompt() },
    { role: "user", content: buildAnalyzeUserPrompt(snapshot) },
  ];

  const turn = await callChatCompletionsWithTools({
    messages,
    tools: [],
    config: chatConfig,
    userId,
    maxTokens: 600,
  });

  // AI 调用失败时降级：仍返回基础数据，suitableFor/tags/note 为空。
  const aiOutput = parseAiOutput(turn?.content ?? null, snapshot);

  // 3. 应用建议（仅对已 star 仓库）。
  let applied = false;
  let hint: string | undefined;
  if (input.applySuggestions) {
    if (snapshot.isStarred && snapshot.id) {
      applied = await applySuggestionsToStarredRepo(userId, snapshot.id, aiOutput);
      if (!applied) {
        hint = "部分建议应用失败，请查看服务器日志。";
      }
    } else {
      applied = false;
      hint = "未 star 仓库不能应用建议。请先调用 sync_stars 或先 star 该仓库，再调用 analyze_repo 并设置 applySuggestions=true。";
    }
  }

  // 4. 构造 suggestedNextActions（spec 第 7 节）——agent 可直接调用。
  const suggestedNextActions: AnalyzeRepoResult["suggestedNextActions"] = [];

  if (snapshot.isStarred && snapshot.id && !applied) {
    // 已 star 但未应用建议：建议 agent 引导用户确认后调用 add_star_tag/set_star_note。
    for (const tag of aiOutput.suggestedTags) {
      suggestedNextActions.push({
        tool: "add_star_tag",
        args: { repo: snapshot.fullName, tag },
        reason: aiOutput.suitableFor
          ? `该仓库适合：${aiOutput.suitableFor.slice(0, 60)}`
          : "AI 建议的标签",
      });
    }
    if (aiOutput.suggestedNote) {
      suggestedNextActions.push({
        tool: "set_star_note",
        args: { repo: snapshot.fullName, note: aiOutput.suggestedNote },
        reason: "AI 生成的建议备注",
      });
    }
  } else if (!snapshot.isStarred) {
    // 未 star：建议 agent 引导用户先 star（GitHub 上）后重新 sync_stars。
    suggestedNextActions.push({
      tool: "sync_stars",
      args: {},
      reason: "若用户已在 GitHub star 该仓库，调用同步后即可应用建议标签和备注。",
    });
  }

  return {
    data: {
      repo: {
        id: snapshot.id,
        fullName: snapshot.fullName,
        description: snapshot.description,
        htmlUrl: snapshot.htmlUrl,
        stargazersCount: snapshot.stargazersCount,
        language: snapshot.language,
        topics: snapshot.topics,
      },
      summary: aiOutput.summary,
      suitableFor: aiOutput.suitableFor,
      suggestedTags: aiOutput.suggestedTags,
      suggestedNote: aiOutput.suggestedNote,
      isStarred: snapshot.isStarred,
      applied,
      ...(hint ? { hint } : {}),
    },
    meta: { empty: false },
    suggestedNextActions,
    reasoningHints,
  };
}
