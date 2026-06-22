import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import {
  type AiRuntimeConfig,
  resolveAiRuntimeConfig,
} from "@starlens/server/server/ai/configs";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { trackAiUsage } from "@starlens/server/server/ai/usage-buffer";
import { searchRepos, searchReposRanked } from "@starlens/server/server/repos/repository";

// ─── 常量 ────────────────────────────────────────────────────────────────────
// P0: 候选上限 8→15；P1: 召回量 8→20；P2: broadPool 80→100 / pick 池 30→50
const RECALL_PER_KEYWORD = 20;
const CANDIDATE_LIMIT = 20;
const BROAD_POOL_SIZE = 100;
const PICK_POOL_LIMIT = 50;
const ANSWER_CANDIDATE_LIMIT = 15;
const TS_RANK_THRESHOLD = 0.01; // 低于此分数视为低置信度，不进候选池

// ─── 类型 ────────────────────────────────────────────────────────────────────
type Candidate = {
  id: string;
  fullName: string;
  description: string;
  aiSummary: string | undefined;
  repoSummary: string;
  userNote: string;
  topics: string[];
  tags: string[];
  language: string;
  stargazersCount: number;
  tsRank: number;
};

type CandidateSource =
  | "question_search"
  | "heuristic_search"
  | "expanded_search"
  | "heuristic_pool"
  | "ai_pool_pick";

type QueryKind = "question" | "heuristic" | "expanded";

type QuerySpec = {
  query: string;
  kind: QueryKind;
};

type RecalledCandidate = Candidate & {
  reason: string;
  score: number;
  source: CandidateSource;
};

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  // 中文注释：部分第三方端点可能不返回 usage，全部字段做容错处理。
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type SearchRepoItem = Awaited<ReturnType<typeof searchRepos>>["items"][number];
type RankedRepoItem = Awaited<ReturnType<typeof searchReposRanked>>[number];

type ChatRuntimeConfig = Omit<Pick<
  AiRuntimeConfig,
  "apiKey" | "baseUrl" | "extraHeaders" | "id" | "model" | "providerType"
>, "baseUrl"> & { baseUrl: string };

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function asChatRuntimeConfig(config: AiRuntimeConfig | null): ChatRuntimeConfig | null {
  if (!config?.baseUrl?.trim()) return null;
  return { ...config, baseUrl: config.baseUrl };
}

function resolveChatCompletionsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/v1")
    ? `${normalizedPath}/chat/completions`
    : `${normalizedPath}/v1/chat/completions`;
  return url.toString();
}

function stripThinkBlocks(text: string | null) {
  if (!text) return "";
  return text.replace(/<think[\s\S]*?<\/think>/gi, " ").trim();
}

// ─── 意图识别 ─────────────────────────────────────────────────────────────────
type QueryIntent =
  | { kind: "sort"; sort: "stars" | "updated" | "recent"; topN: number }
  | { kind: "semantic" };

function detectQueryIntent(question: string): QueryIntent {
  const q = question.toLowerCase();

  // star 数排序类：star 最多 / stars 最高 / 最受欢迎
  if (/(star|stars|star数|star最多|最多star|最受欢迎|最热门|热度最高|最高star|收藏最多)/i.test(q)) {
    const topMatch = q.match(/(?:前|top)\s*(\d+)/);
    const topN = topMatch ? parseInt(topMatch[1], 10) : 10;
    return { kind: "sort", sort: "stars", topN: Math.min(topN, 20) };
  }

  // 最近更新 / 最新
  if (/(最近更新|最新|最近推送|recently updated|latest)/i.test(q)) {
    return { kind: "sort", sort: "updated", topN: 10 };
  }

  // 最近收藏
  if (/(最近收藏|最新收藏|recently starred)/i.test(q)) {
    return { kind: "sort", sort: "recent", topN: 10 };
  }

  return { kind: "semantic" };
}

// 中文注释：富文本候选上下文，包含 star 数用于排序型问题的回答。
function buildCandidateContext(candidates: Candidate[]) {
  return candidates
    .map((item, index) => {
      const summary = item.aiSummary?.trim() || item.repoSummary?.trim() || item.description?.trim() || "无";
      const userTags = item.tags.length > 0 ? item.tags : [];
      const githubTopics = item.topics.length > 0 ? item.topics : [];
      const lines = [
        `#${index + 1} ${item.fullName}`,
        `Stars: ${item.stargazersCount.toLocaleString()}`,
        `语言: ${item.language || "unknown"}`,
        `摘要: ${summary}`,
      ];
      if (item.description?.trim() && item.description !== summary) {
        lines.push(`描述: ${item.description}`);
      }
      if (item.userNote?.trim()) {
        lines.push(`用户备注: ${item.userNote}`);
      }
      if (userTags.length > 0) {
        lines.push(`用户标签: ${userTags.join(", ")}`);
      }
      if (githubTopics.length > 0) {
        lines.push(`GitHub 话题: ${githubTopics.slice(0, 5).join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildHeuristicTerms(question: string) {
  const terms: string[] = [];
  const mapping: Array<{ pattern: RegExp; terms: string[] }> = [
    { pattern: /(图像|图片|照片|视觉|cv)/i, terms: ["image processing", "computer vision", "opencv"] },
    { pattern: /(视频|音视频|剪辑|转场|字幕)/i, terms: ["video processing", "ffmpeg", "multimedia"] },
    { pattern: /(语音|音频|tts|asr)/i, terms: ["speech", "audio processing", "tts asr"] },
    { pattern: /(前端|界面|ui|组件)/i, terms: ["frontend", "ui components", "react"] },
    { pattern: /(后端|接口|api|服务)/i, terms: ["backend", "api service", "server"] },
    { pattern: /(检索|搜索|向量|rag)/i, terms: ["search", "retrieval", "rag"] },
    { pattern: /(代理|智能体|agent)/i, terms: ["ai agent", "agent framework", "automation"] },
  ];
  for (const entry of mapping) {
    if (entry.pattern.test(question)) terms.push(...entry.terms);
  }
  return Array.from(new Set(terms));
}

function uniqueQuerySpecs(specs: QuerySpec[]) {
  const seen = new Set<string>();
  const unique: QuerySpec[] = [];
  for (const spec of specs) {
    const normalized = spec.query.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ ...spec, query: spec.query.trim() });
  }
  return unique;
}

function sourceForQueryKind(kind: QueryKind): CandidateSource {
  if (kind === "question") return "question_search";
  if (kind === "heuristic") return "heuristic_search";
  return "expanded_search";
}

function reasonForQuerySpec(spec: QuerySpec) {
  if (spec.kind === "question") return `Matched your question directly: "${spec.query}".`;
  if (spec.kind === "heuristic") return `Matched heuristic term: "${spec.query}".`;
  return `Matched expanded term: "${spec.query}".`;
}

function baseScoreForQueryKind(kind: QueryKind) {
  if (kind === "question") return 1000;
  if (kind === "heuristic") return 700;
  return 400;
}

function splitSearchTerms(terms: string[]) {
  return terms
    .flatMap((term) => term.toLowerCase().split(/\s+/g))
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function heuristicPickFromPool(question: string, pool: Candidate[]) {
  const mappedTerms = splitSearchTerms(buildHeuristicTerms(question));
  if (mappedTerms.length === 0) return [];
  const picked = pool.filter((item) => {
    const haystack = [item.fullName, item.description, item.repoSummary, item.aiSummary ?? "", item.tags.join(" "), item.topics.join(" "), item.userNote, item.language]
      .join(" ").toLowerCase();
    return mappedTerms.some((term) => haystack.includes(term));
  });
  return picked.slice(0, 8);
}

function mergeCandidate(
  merged: Map<string, RecalledCandidate>,
  candidate: Candidate,
  metadata: Pick<RecalledCandidate, "reason" | "score" | "source">,
) {
  const existing = merged.get(candidate.id);
  if (
    !existing
    || metadata.score > existing.score
    || (metadata.score === existing.score && candidate.tsRank > existing.tsRank)
  ) {
    merged.set(candidate.id, { ...candidate, ...metadata });
  }
}

function toCandidate(item: SearchRepoItem | RankedRepoItem): Candidate {
  const tsRank = "tsRank" in item ? (item.tsRank as number) : 0;
  return {
    id: item.id,
    fullName: item.fullName,
    description: item.description,
    aiSummary: item.aiSummary,
    repoSummary: item.repoSummary,
    userNote: item.note ?? "",
    topics: item.topics,
    tags: item.tags,
    language: item.language,
    stargazersCount: item.stargazersCount,
    tsRank,
  };
}

// ─── AI 调用 ──────────────────────────────────────────────────────────────────

async function expandQuestionTermsWithProvider(question: string, config: ChatRuntimeConfig | null, userId?: string) {
  if (!config) return [];

  const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 150,
      messages: [
        {
          role: "system",
          content: "把用户检索意图转成最多8个技术关键词或短语，偏英文，逗号分隔，只输出关键词，不要解释。",
        },
        { role: "user", content: question },
      ],
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  if (userId) {
    trackAiUsage({ userId, endpoint: "ask/expand", model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
  }
  const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
  if (!raw) return [];

  return raw
    .split(/[,\n，、;；]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 40)
    .slice(0, 8);
}

// 中文注释：P2 — pick 池从 30 扩至 50，compact 数据加入 aiSummary 和用户标签，提升精排准确度。
async function pickCandidatesWithProvider(question: string, pool: Candidate[], config: ChatRuntimeConfig | null, userId?: string) {
  if (!config || pool.length === 0) return [];

  const compactPool = pool.slice(0, PICK_POOL_LIMIT).map((item, index) => ({
    idx: index + 1,
    id: item.id,
    fullName: item.fullName,
    language: item.language,
    summary: item.aiSummary?.trim() || item.repoSummary?.trim() || item.description?.trim() || "",
    tags: item.tags.length > 0 ? item.tags : item.topics.slice(0, 5),
    note: item.userNote || undefined,
  }));

  const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content: "你是仓库筛选助手。根据用户问题，从候选仓库里选最相关的1到10个，输出JSON：{\"ids\":[\"id1\",\"id2\"]}。只输出JSON。",
        },
        { role: "user", content: `问题：${question}\n候选池：${JSON.stringify(compactPool)}` },
      ],
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  if (userId) {
    trackAiUsage({ userId, endpoint: "ask/pick", model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
  }
  const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
  if (!raw) return [];

  const idsMatch = raw.match(/"ids"\s*:\s*\[([^\]]*)]/);
  if (!idsMatch) return [];
  const ids = idsMatch[1].split(",").map((item) => item.replace(/["'\s]/g, "")).filter(Boolean);
  if (ids.length === 0) return [];

  const byId = new Map(pool.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
}

// 中文注释：召回层 — 每个关键词取 20 条，过滤 ts_rank < 阈值的低置信度结果，候选上限 20。
async function recallCandidates(userId: string, question: string, config: ChatRuntimeConfig | null) {
  const querySpecs = uniqueQuerySpecs([
    { query: question, kind: "question" },
    ...buildHeuristicTerms(question).map((query) => ({ query, kind: "heuristic" as const })),
    ...(await expandQuestionTermsWithProvider(question, config, userId)).map((query) => ({ query, kind: "expanded" as const })),
  ]).slice(0, 10);

  const merged = new Map<string, RecalledCandidate>();

  for (const spec of querySpecs) {
    const items = await searchReposRanked(userId, spec.query, RECALL_PER_KEYWORD);

    for (const [index, item] of items.entries()) {
      const candidate = toCandidate(item);
      // 中文注释：ts_rank < 阈值说明仅靠 ilike 模糊匹配命中，置信度低，过滤掉。
      if (candidate.tsRank < TS_RANK_THRESHOLD) continue;

      const tsBonus = Math.round(candidate.tsRank * 200);
      mergeCandidate(merged, candidate, {
        source: sourceForQueryKind(spec.kind),
        reason: reasonForQuerySpec(spec),
        score: baseScoreForQueryKind(spec.kind) - index * 8 + tsBonus,
      });
    }

    if (merged.size >= CANDIDATE_LIMIT) break;
  }

  let candidates = Array.from(merged.values())
    .sort((left, right) => right.score - left.score || right.tsRank - left.tsRank)
    .slice(0, CANDIDATE_LIMIT);

  if (candidates.length === 0) {
    // 中文注释：P2 — broadPool 扩至 100 条，给 pick 和 heuristic 更大搜索空间。
    const broadPoolResult = await searchRepos(userId, {
      page: 1,
      pageSize: BROAD_POOL_SIZE,
      sort: "recent",
    });
    const broadPool = broadPoolResult.items.map(toCandidate);

    candidates = heuristicPickFromPool(question, broadPool).map((candidate, index) => ({
      ...candidate,
      source: "heuristic_pool" as const,
      reason: "Matched heuristic terms against recent repository metadata.",
      score: 250 - index * 10,
    }));

    if (candidates.length === 0) {
      candidates = (await pickCandidatesWithProvider(question, broadPool, config, userId)).map((candidate, index) => ({
        ...candidate,
        source: "ai_pool_pick" as const,
        reason: "Selected by AI fallback from recent repository candidates.",
        score: 150 - index * 10,
      }));
    }
  }

  return {
    candidates,
    queries: querySpecs.map((spec) => spec.query),
  };
}

// 中文注释：精排层 — 最多 15 条富文本候选，增大 max_tokens 以支持更多候选的详细回答。
async function askProvider(question: string, candidates: Candidate[], config: ChatRuntimeConfig | null, userId?: string) {
  if (!config) return null;

  const topCandidates = candidates.slice(0, ANSWER_CANDIDATE_LIMIT);

  const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "你是仓库检索助手。基于候选仓库给出精炼中文结论：1) 列出最匹配的1到3个仓库及一句话理由；2) 对于「star 最多」「最受欢迎」等排序类问题，直接按候选列表中 Stars 字段排名给出答案，无需猜测；3) 若候选中有用户自己备注或标签过的仓库，优先推荐；4) 若无明显匹配则明确说明。",
        },
        {
          role: "user",
          content: `用户问题：${question}\n\n候选仓库：\n${buildCandidateContext(topCandidates)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  if (userId) {
    trackAiUsage({ userId, endpoint: "ask/answer", model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
  }
  const content = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null)
    .replace(/\s+/g, " ")
    .trim();
  return content || null;
}

// ─── 路由入口 ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.question !== "string" || !body.question.trim()) {
    return fail("invalid_question", "Question is required.");
  }

  const question = body.question.trim();
  const runtimeResolution = await resolveAiRuntimeConfig(user.id, "chat_completions");
  const chatConfig = asChatRuntimeConfig(runtimeResolution.config);

  // ─── 意图识别：排序型问题直接走 DB 排序，不经语义召回 ────────────────────────
  const intent = detectQueryIntent(question);

  let candidates: RecalledCandidate[];
  let queries: string[];

  if (intent.kind === "sort") {
    const result = await searchRepos(user.id, {
      page: 1,
      pageSize: intent.topN,
      sort: intent.sort,
    });
    const sortLabel =
      intent.sort === "stars" ? "按 Star 数降序" :
      intent.sort === "updated" ? "按最近推送时间降序" :
      "按收藏时间降序";
    candidates = result.items.map((item, index) => ({
      id: item.id,
      fullName: item.fullName,
      description: item.description ?? "",
      aiSummary: item.aiSummary,
      repoSummary: item.repoSummary ?? "",
      userNote: item.note ?? "",
      topics: item.topics ?? [],
      tags: item.tags ?? [],
      language: item.language ?? "",
      stargazersCount: item.stargazersCount ?? 0,
      tsRank: 1,
      reason: `${sortLabel}，排名第 ${index + 1}（${(item.stargazersCount ?? 0).toLocaleString()} stars）`,
      source: "question_search" as const,
      score: 1000 - index * 10,
    }));
    queries = [question];
  } else {
    const recalled = await recallCandidates(user.id, question, chatConfig);
    candidates = recalled.candidates;
    queries = recalled.queries;
  }

  const hasCandidates = candidates.length > 0;

  let answer =
    hasCandidates
      ? `已检索到 ${candidates.length} 个匹配仓库，最相关的是 ${candidates[0]?.fullName ?? "未知仓库"}。`
      : `未找到匹配仓库。可尝试这些关键词：${queries.slice(0, 4).join(" / ")}`;

  if (hasCandidates) {
    try {
      const aiAnswer = await askProvider(question, candidates, chatConfig, user.id);
      if (aiAnswer) answer = aiAnswer;
    } catch {
      // Ignore provider failures and fall back to deterministic local answer.
    }
  }

  return ok({
    answer,
    candidates: candidates.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      reason: item.reason,
      source: item.source,
      score: item.score,
    })),
    providerConfigId: chatConfig?.id ?? null,
    providerConfigSource: runtimeResolution.source,
  });
}
