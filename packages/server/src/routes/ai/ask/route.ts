import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import {
  type AiRuntimeConfig,
  resolveAiRuntimeConfig,
} from "@starlens/server/server/ai/configs";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { trackAiUsage } from "@starlens/server/server/ai/usage-buffer";
import { getRepoDetail, getRepoStats, searchRepos, searchReposRanked } from "@starlens/server/server/repos/repository";

// ─── 常量 ────────────────────────────────────────────────────────────────────
// P0: 候选上限 8→15；P1: 召回量 8→20；P2: broadPool 80→100 / pick 池 30→50
const RECALL_PER_KEYWORD = 20;
const CANDIDATE_LIMIT = 20;
const BROAD_POOL_SIZE = 100;
const PICK_POOL_LIMIT = 50;
const ANSWER_CANDIDATE_LIMIT = 15;
const TS_RANK_THRESHOLD = 0.01; // 低于此分数视为低置信度，不进候选池

// ─── 安全限制 ─────────────────────────────────────────────────────────────────
const MAX_QUESTION_LENGTH = 1000;
const RATE_LIMIT_USER_KEY_RPM = 20;  // 用户自有 API Key
const RATE_LIMIT_SYSTEM_KEY_RPM = 5; // 系统共享 Key（更严格）

const rateLimitBuckets = new Map<string, { timestamps: number[] }>();

function checkRateLimit(userId: string, isSystemKey: boolean): { allowed: boolean; retryAfterSeconds: number } {
  const rpm = isSystemKey ? RATE_LIMIT_SYSTEM_KEY_RPM : RATE_LIMIT_USER_KEY_RPM;
  const key = `${userId}:${isSystemKey ? "sys" : "usr"}`;
  const now = Date.now();
  const windowMs = 60_000;

  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitBuckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= rpm) {
    const retryAfterSeconds = Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

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

// 用 XML 标签隔离用户输入，防止 prompt injection
function wrapUserQuestion(question: string): string {
  return `<question>\n${question}\n</question>`;
}

// ─── 意图识别 ─────────────────────────────────────────────────────────────────
type StructuredIntent = {
  sort?: "stars" | "updated" | "recent";
  topN?: number;
  language?: string;
  owner?: string;
  favorite?: boolean;
  tag?: string;
  q?: string;
  // 新增过滤维度
  minStars?: number;
  maxStars?: number;
  starredAfter?: string;   // ISO 日期字符串
  starredBefore?: string;
  pushedAfter?: string;
  hasNote?: boolean;
  noteContains?: string;
};

type QueryIntent =
  | { kind: "structured"; intent: StructuredIntent }
  | { kind: "single_repo"; repoIdentifier: string }
  | { kind: "count"; filter: StructuredIntent }
  | { kind: "existence"; query: string; filter: StructuredIntent }
  | { kind: "comparison"; repoA: string; repoB: string }
  | { kind: "stats" }
  | { kind: "recommendation"; context: string }
  | { kind: "semantic" };

// AI 结构化意图提取
async function detectQueryIntentByAI(question: string, config: ChatRuntimeConfig): Promise<QueryIntent> {
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = `你是仓库检索意图解析器。将用户问题转换为结构化 JSON。今天日期：${today}

可提取字段（全部可选）：
- kind: "count"（统计数量）| "existence"（存在性检查）| "comparison"（对比两仓库）| "stats"（分布统计）| "recommendation"（推荐）
  kind 出现时同时提取相关补充字段
- sort: "stars" | "updated" | "recent"
- topN: 数字，最大20
- language: 小写英文语言名
- owner: GitHub 用户名/组织名
- favorite: true（仅收藏）
- tag: 用户标签
- q: 语义关键词
- repoIdentifier: 分析/介绍某特定仓库时提取（owner/repo 或名称关键词）
- minStars: star 数下限整数
- maxStars: star 数上限整数
- starredAfter: 收藏时间下限 ISO 日期（"上个月"→上月1日，"今年"→今年1月1日，"最近30天"→30天前）
- starredBefore: 收藏时间上限 ISO 日期
- pushedAfter: 最后推送时间下限 ISO 日期
- hasNote: true（只查有备注的）
- noteContains: 备注内容搜索词
- query: kind=existence 时填写要查找的内容
- repoA, repoB: kind=comparison 时填写两个仓库名
- context: kind=recommendation 时填写推荐场景描述

规则：
1. 只输出 JSON，不要解释
2. 纯语义搜索输出 {}
3. repoIdentifier 与 kind 互斥，出现时只输出 repoIdentifier
4. kind=count 时：同时提取 language/owner/tag/favorite/hasNote 等过滤条件
5. kind=existence 时：提取 query 描述要查找什么
6. 关键区分："star了/starred/收藏了" 是收藏动作 → 提取 starredAfter 时间过滤 + sort:recent；"star数/star最多/star排" 才是按 star 数排序 → sort:stars

示例：
"star最多的前5个" → {"sort":"stars","topN":5}
"最近收藏的Python项目" → {"sort":"recent","language":"python"}
"TypeScript仓库按star排" → {"sort":"stars","language":"typescript"}
"AI agent相关的" → {"q":"AI agent"}
"我收藏的Go项目" → {"favorite":true,"language":"go"}
"分析 facebook/react" → {"repoIdentifier":"facebook/react"}
"build-your-own-x 怎么用" → {"repoIdentifier":"build-your-own-x"}
"我有多少个Python项目" → {"kind":"count","language":"python"}
"我总共收藏了多少" → {"kind":"count"}
"我有没有收藏 vercel/next.js" → {"kind":"existence","query":"vercel/next.js"}
"langchain 和 llamaindex 哪个更好" → {"kind":"comparison","repoA":"langchain","repoB":"llamaindex"}
"我的收藏按语言怎么分布" → {"kind":"stats"}
"推荐适合初学者的Python项目" → {"kind":"recommendation","context":"适合初学者的Python项目"}
"上个月收藏的仓库" → {"starredAfter":"<上月1日>","sort":"recent"}
"star超过1万的" → {"minStars":10000,"sort":"stars"}
"我写了备注的仓库" → {"hasNote":true}
"备注里有work的" → {"noteContains":"work"}
"我今天star了哪些仓库" → {"starredAfter":"${today}","sort":"recent"}
"今天收藏了哪些" → {"starredAfter":"${today}","sort":"recent"}
"昨天star的项目" → {"starredAfter":"<昨天>","starredBefore":"${today}","sort":"recent"}
"今天star了哪些，都是做什么的" → {"starredAfter":"${today}","sort":"recent"}`;

  try {
    const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `当前日期：${today}\n${wrapUserQuestion(question)}` },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`intent AI status ${response.status}`);

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { kind: "semantic" };

    const parsed = JSON.parse(jsonMatch[0]) as StructuredIntent & {
      repoIdentifier?: string;
      kind?: string;
      query?: string;
      repoA?: string;
      repoB?: string;
      context?: string;
    };

    if (parsed.repoIdentifier?.trim()) {
      return { kind: "single_repo", repoIdentifier: parsed.repoIdentifier.trim() };
    }
    if (parsed.kind === "count") {
      const { kind: _k, repoIdentifier: _r, query: _q, repoA: _a, repoB: _b, context: _c, ...filter } = parsed;
      return { kind: "count", filter };
    }
    if (parsed.kind === "existence") {
      const { kind: _k, repoIdentifier: _r, query, repoA: _a, repoB: _b, context: _c, ...filter } = parsed;
      return { kind: "existence", query: query ?? question, filter };
    }
    if (parsed.kind === "comparison" && parsed.repoA && parsed.repoB) {
      return { kind: "comparison", repoA: parsed.repoA, repoB: parsed.repoB };
    }
    if (parsed.kind === "stats") return { kind: "stats" };
    if (parsed.kind === "recommendation") {
      return { kind: "recommendation", context: parsed.context ?? question };
    }

    const hasStructure = !!(parsed.sort || parsed.language || parsed.owner || parsed.favorite !== undefined || parsed.tag || parsed.minStars !== undefined || parsed.maxStars !== undefined || parsed.starredAfter || parsed.starredBefore || parsed.pushedAfter || parsed.hasNote || parsed.noteContains);
    return hasStructure ? { kind: "structured", intent: parsed } : { kind: "semantic" };
  } catch {
    return { kind: "semantic" };
  }
}

async function detectQueryIntent(question: string, config: ChatRuntimeConfig | null): Promise<QueryIntent> {
  if (config) {
    return detectQueryIntentByAI(question, config);
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

// 单仓库分析：提供更丰富的上下文（含 readmeExcerpt）
function buildSingleRepoContext(repo: SearchRepoItem): string {
  const lines: string[] = [
    `仓库：${repo.fullName}`,
    `Stars: ${(repo.stargazersCount ?? 0).toLocaleString()}`,
    `语言: ${repo.language || "unknown"}`,
    `主页: ${repo.htmlUrl ?? ""}`,
  ];
  if (repo.description?.trim()) lines.push(`简介: ${repo.description}`);
  if (repo.aiSummary?.trim()) lines.push(`AI 摘要: ${repo.aiSummary}`);
  else if (repo.repoSummary?.trim()) lines.push(`摘要: ${repo.repoSummary}`);
  if (repo.readmeExcerpt?.trim()) lines.push(`README 摘录:\n${repo.readmeExcerpt.slice(0, 1200)}`);
  if ((repo.topics ?? []).length > 0) lines.push(`话题标签: ${(repo.topics ?? []).join(", ")}`);
  if (repo.note?.trim()) lines.push(`用户备注: ${repo.note}`);
  return lines.join("\n");
}

// ─── 公用辅助函数 ─────────────────────────────────────────────────────────────

// 统一 AI 调用封装
async function callAIWithPrompt({
  system, user: userContent, maxTokens = 400, config, userId, endpoint,
}: {
  system: string; user: string; maxTokens?: number;
  config: ChatRuntimeConfig | null; userId?: string; endpoint: string;
}): Promise<string | null> {
  if (!config) return null;
  try {
    const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: { ...config.extraHeaders, "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, temperature: 0.3, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as OpenAiCompatibleResponse;
    if (userId) {
      trackAiUsage({ userId, endpoint, model: config.model, promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 });
    }
    return stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null).replace(/\s+/g, " ").trim() || null;
  } catch { return null; }
}

// 将 SearchRepoItem 转换为 RecalledCandidate
function toRecalledCandidate(item: SearchRepoItem, index: number, reason: string): RecalledCandidate {
  return {
    id: item.id, fullName: item.fullName, description: item.description ?? "",
    aiSummary: item.aiSummary, repoSummary: item.repoSummary ?? "",
    userNote: item.note ?? "", topics: item.topics ?? [], tags: item.tags ?? [],
    language: item.language ?? "", stargazersCount: item.stargazersCount ?? 0,
    tsRank: 1, reason, source: "question_search" as const, score: 1000 - index * 10,
  };
}

// 生成过滤条件的中文描述
function buildFilterDesc(si: StructuredIntent): string {
  const parts: string[] = [];
  if (si.language) parts.push(`${si.language} 语言`);
  if (si.owner) parts.push(`${si.owner} 作者`);
  if (si.favorite) parts.push("已收藏");
  if (si.tag) parts.push(`"${si.tag}" 标签`);
  if (si.hasNote) parts.push("有备注");
  if (si.noteContains) parts.push(`备注含 "${si.noteContains}"`);
  if (si.minStars !== undefined) parts.push(`Star ≥ ${si.minStars.toLocaleString()}`);
  if (si.maxStars !== undefined) parts.push(`Star ≤ ${si.maxStars.toLocaleString()}`);
  if (si.q) parts.push(`"${si.q}"`);
  return parts.length > 0 ? `（${parts.join("、")}）` : "";
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

// 从问题中提取 ASCII 关键词，处理"中文问题夹带英文技术词"场景（如"关于gpt image的仓库"→["gpt","image"]）
function extractAsciiTerms(question: string): string[] {
  const stopwords = new Set(["the", "and", "for", "are", "was", "with", "that", "this", "have", "from"]);
  return question
    .split(/[一-鿿　-〿＀-￯\s，。、！？；：]+/)
    .flatMap((chunk) => chunk.split(/[^a-zA-Z0-9._-]+/))
    .map((t) => t.trim().toLowerCase().replace(/^[-._]+|[-._]+$/g, ""))
    .filter((t) => t.length >= 2 && /[a-z]/i.test(t) && !stopwords.has(t));
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
        { role: "user", content: wrapUserQuestion(question) },
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
        { role: "user", content: `${wrapUserQuestion(question)}\n候选池：${JSON.stringify(compactPool)}` },
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
    // 中文注释：从问题中提取 ASCII 关键词作为补充查询，处理"中文问句夹英文技术词"场景，无需 AI 也能召回。
    ...extractAsciiTerms(question).map((query) => ({ query, kind: "heuristic" as const })),
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
          content: `${wrapUserQuestion(question)}\n\n候选仓库：\n${buildCandidateContext(topCandidates)}`,
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

  if (question.length > MAX_QUESTION_LENGTH) {
    return fail("question_too_long", `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.`);
  }

  const runtimeResolution = await resolveAiRuntimeConfig(user.id, "chat_completions");
  const chatConfig = asChatRuntimeConfig(runtimeResolution.config);

  const isSystemKey = runtimeResolution.source === "system_default";
  const rateCheck = checkRateLimit(user.id, isSystemKey);
  if (!rateCheck.allowed) {
    return fail("rate_limit_exceeded", `Too many requests. Retry in ${rateCheck.retryAfterSeconds}s.`, 429);
  }

  // ─── 意图识别：AI 结构化提取，无 AI 时正则兜底 ────────────────────────────────
  const intent = await detectQueryIntent(question, chatConfig);

  const earlyReturn = (answer: string, cands: Array<{ id: string; fullName: string; reason: string; source: string; score: number }> = []) =>
    ok({ answer, candidates: cands, providerConfigId: chatConfig?.id ?? null, providerConfigSource: runtimeResolution.source });

  // 将 StructuredIntent 中的 ISO 字符串转换为 Date 对象
  function parseSI(si: StructuredIntent) {
    return {
      ...si,
      starredAfter: si.starredAfter ? new Date(si.starredAfter) : undefined,
      starredBefore: si.starredBefore ? new Date(si.starredBefore) : undefined,
      pushedAfter: si.pushedAfter ? new Date(si.pushedAfter) : undefined,
    };
  }

  // ─── count ────────────────────────────────────────────────────────────────────
  if (intent.kind === "count") {
    const si = intent.filter ?? {};
    const result = await searchRepos(user.id, { ...parseSI(si), pageSize: 1, page: 1 });
    const desc = buildFilterDesc(si);
    return earlyReturn(`你的收藏中${desc}共有 **${result.total}** 个仓库。`);
  }

  // ─── existence ───────────────────────────────────────────────────────────────
  if (intent.kind === "existence") {
    const result = await searchRepos(user.id, { ...parseSI(intent.filter), q: intent.query, sort: "relevance", pageSize: 5 });
    if (result.total === 0) {
      return earlyReturn(`在你的收藏中**未找到**与「${intent.query}」相关的仓库。`);
    }
    const list = result.items.slice(0, 3).map((r) => `- **${r.fullName}**（${(r.stargazersCount ?? 0).toLocaleString()} ⭐）`).join("\n");
    return earlyReturn(
      `找到 **${result.total}** 个相关仓库：\n${list}`,
      result.items.slice(0, 3).map((r, i) => toRecalledCandidate(r, i, "匹配存在性查询")),
    );
  }

  // ─── comparison ──────────────────────────────────────────────────────────────
  if (intent.kind === "comparison") {
    const [resA, resB] = await Promise.all([
      searchRepos(user.id, { q: intent.repoA, sort: "relevance", pageSize: 3 }),
      searchRepos(user.id, { q: intent.repoB, sort: "relevance", pageSize: 3 }),
    ]);
    const repoA = resA.items.find((r) => r.fullName?.toLowerCase().includes(intent.repoA.toLowerCase())) ?? resA.items[0];
    const repoB = resB.items.find((r) => r.fullName?.toLowerCase().includes(intent.repoB.toLowerCase())) ?? resB.items[0];

    if (!repoA && !repoB) {
      return earlyReturn(`「${intent.repoA}」和「${intent.repoB}」在你的收藏中均未找到，请确认是否已收藏这两个仓库。`);
    }

    const [detailA, detailB] = await Promise.all([
      repoA ? (getRepoDetail(user.id, repoA.id)) : Promise.resolve(null),
      repoB ? (getRepoDetail(user.id, repoB.id)) : Promise.resolve(null),
    ]);

    const contextParts = [
      detailA ? `【${detailA.fullName}】\n${buildSingleRepoContext(detailA)}` : `未找到「${intent.repoA}」`,
      detailB ? `【${detailB.fullName}】\n${buildSingleRepoContext(detailB)}` : `未找到「${intent.repoB}」`,
    ].join("\n\n---\n\n");

    const answer = await callAIWithPrompt({
      system: "你是仓库对比分析师。基于两个仓库的信息，用中文给出结构化对比：1) 核心定位差异；2) 适用场景；3) 优缺点对比；4) 推荐结论（说明哪个更适合用户的问题）。",
      user: `${wrapUserQuestion(question)}\n\n${contextParts}`,
      maxTokens: 700, config: chatConfig, userId: user.id, endpoint: "ask/comparison",
    }) ?? `对比 ${detailA?.fullName ?? intent.repoA} 和 ${detailB?.fullName ?? intent.repoB}：请参考两仓库详情。`;

    const cands = [detailA, detailB].filter(Boolean).map((r, i) =>
      toRecalledCandidate(r as SearchRepoItem, i, "用于对比分析")
    );
    return earlyReturn(answer, cands);
  }

  // ─── stats ───────────────────────────────────────────────────────────────────
  if (intent.kind === "stats") {
    const stats = await getRepoStats(user.id);
    const topLangs = stats.byLanguage.slice(0, 8)
      .map((l, i) => `${i + 1}. ${l.language}：${l.count} 个`)
      .join("\n");
    const fallback = [
      `你的收藏共 **${stats.total}** 个仓库，其中 **${stats.totalFavorites}** 个标记为收藏。`,
      `\n**语言分布 Top ${Math.min(stats.byLanguage.length, 8)}：**\n${topLangs}`,
      stats.mostStarredRepo ? `\n**Star 最多：** ${stats.mostStarredRepo.fullName}（${stats.mostStarredRepo.stargazersCount.toLocaleString()} ⭐）` : "",
    ].join("");

    const answer = await callAIWithPrompt({
      system: "你是数据分析助手。基于用户的 GitHub 收藏统计，用中文给出简洁的分析：主要技术偏好、收藏亮点、可能的学习方向建议。",
      user: `总仓库数：${stats.total}，收藏数：${stats.totalFavorites}\n语言分布：\n${topLangs}\nStar 最多：${stats.mostStarredRepo?.fullName ?? "无"}（${stats.mostStarredRepo?.stargazersCount.toLocaleString() ?? 0} ⭐）\n${wrapUserQuestion(question)}`,
      maxTokens: 400, config: chatConfig, userId: user.id, endpoint: "ask/stats",
    }) ?? fallback;

    return earlyReturn(answer);
  }

  // ─── recommendation ───────────────────────────────────────────────────────────
  if (intent.kind === "recommendation") {
    const [stats, recentStars] = await Promise.all([
      getRepoStats(user.id),
      searchRepos(user.id, { sort: "recent", pageSize: 15 }),
    ]);
    const topicSet = [...new Set(recentStars.items.flatMap((r) => r.topics ?? []))].slice(0, 10);
    const userProfile = [
      `语言偏好：${stats.byLanguage.slice(0, 3).map((l) => l.language).join("、") || "未知"}`,
      `近期收藏话题：${topicSet.join("、") || "无"}`,
      `总收藏：${stats.total} 个，收藏：${stats.totalFavorites} 个`,
    ].join("；");

    const answer = await callAIWithPrompt({
      system: "你是 GitHub 仓库推荐助手。基于用户的收藏偏好画像和推荐需求，给出 3-5 个方向性建议。重要：不要随意捏造具体仓库名，只给出技术方向、学习路径和寻找方式。",
      user: `用户画像：${userProfile}\n推荐需求：${intent.context}\n${wrapUserQuestion(question)}`,
      maxTokens: 500, config: chatConfig, userId: user.id, endpoint: "ask/recommendation",
    }) ?? "根据你的收藏偏好，建议关注你常用语言相关的工具链、框架和最佳实践仓库。";

    return earlyReturn(answer);
  }

  // ─── single_repo ──────────────────────────────────────────────────────────────
  if (intent.kind === "single_repo") {
    const searchResult = await searchRepos(user.id, { q: intent.repoIdentifier, sort: "relevance", pageSize: 5 });
    const matched = searchResult.items.find((r) => r.fullName?.toLowerCase() === intent.repoIdentifier.toLowerCase()) ?? searchResult.items[0];

    if (!matched) {
      return earlyReturn(`在你的收藏中未找到仓库「${intent.repoIdentifier}」，请先确认该仓库是否已收藏。`);
    }

    const repoDetail = await getRepoDetail(user.id, matched.id) ?? matched;
    const context = buildSingleRepoContext(repoDetail);

    const answer = await callAIWithPrompt({
      system: "你是仓库分析助手。基于提供的仓库信息，用中文给出精炼、实用的回答。重点包括：用途与核心功能、使用方法、典型场景、优缺点（如有）。回答要具体，避免空话。",
      user: `${wrapUserQuestion(question)}\n\n仓库详情：\n${context}`,
      maxTokens: 600, config: chatConfig, userId: user.id, endpoint: "ask/single_repo",
    }) ?? `关于仓库 ${repoDetail.fullName}：${repoDetail.description ?? repoDetail.repoSummary ?? ""}`;

    return earlyReturn(answer, [toRecalledCandidate(repoDetail as SearchRepoItem, 0, "精确匹配用户指定仓库")]);
  }

  // ─── structured ───────────────────────────────────────────────────────────────
  let candidates: RecalledCandidate[];
  let queries: string[];

  if (intent.kind === "structured") {
    const si = intent.intent;
    const result = await searchRepos(user.id, {
      page: 1,
      pageSize: Math.min(si.topN ?? 10, 20),
      sort: si.sort ?? "relevance",
      language: si.language,
      owner: si.owner,
      favorite: si.favorite,
      tag: si.tag,
      q: si.q,
      minStars: si.minStars,
      maxStars: si.maxStars,
      starredAfter: si.starredAfter ? new Date(si.starredAfter) : undefined,
      starredBefore: si.starredBefore ? new Date(si.starredBefore) : undefined,
      pushedAfter: si.pushedAfter ? new Date(si.pushedAfter) : undefined,
      hasNote: si.hasNote,
      noteContains: si.noteContains,
    });

    const sortLabel =
      si.sort === "stars" ? "按 Star 数降序" :
      si.sort === "updated" ? "按最近推送时间降序" :
      si.sort === "recent" ? "按收藏时间降序" : "按相关性";

    candidates = result.items.map((item, index) =>
      toRecalledCandidate(item, index, `${sortLabel}${buildFilterDesc(si)}，第 ${index + 1} 名（${(item.stargazersCount ?? 0).toLocaleString()} ⭐）`)
    );
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
      id: item.id, fullName: item.fullName, reason: item.reason, source: item.source, score: item.score,
    })),
    providerConfigId: chatConfig?.id ?? null,
    providerConfigSource: runtimeResolution.source,
  });
}
