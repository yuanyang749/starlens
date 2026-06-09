import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import {
  getDefaultAiRuntimeConfig,
  type AiRuntimeConfig,
} from "@starlens/server/server/ai/configs";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { searchRepos } from "@starlens/server/server/repos/repository";

type Candidate = {
  id: string;
  fullName: string;
  description: string;
  repoSummary: string;
  topics: string[];
  tags: string[];
  language: string;
  stargazersCount: number;
  starredAtGithub: string;
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
};

type SearchRepoItem = Awaited<ReturnType<typeof searchRepos>>["items"][number];
type ChatRuntimeConfig = Omit<Pick<
  AiRuntimeConfig,
  "apiKey" | "baseUrl" | "extraHeaders" | "id" | "model" | "providerType"
>, "baseUrl"> & { baseUrl: string };

function resolveOpenAiEnv(): ChatRuntimeConfig | null {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL_KEY?.trim();

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  return {
    id: "env:newapi-openai-compatible",
    providerType: "openai_compatible",
    baseUrl,
    apiKey,
    extraHeaders: {},
    model,
  };
}

function supportsChatCompletions(config: AiRuntimeConfig | null): config is ChatRuntimeConfig {
  return Boolean(
    config
      && config.apiKey.trim()
      && config.baseUrl?.trim()
      && (config.providerType === "openai_compatible" || config.providerType === "vercel_gateway"),
  );
}

async function resolveChatRuntimeConfig(userId: string) {
  try {
    const defaultConfig = await getDefaultAiRuntimeConfig(userId);
    if (supportsChatCompletions(defaultConfig)) {
      return defaultConfig;
    }
  } catch {
    // 中文注释：默认配置损坏时不阻断搜索体验，继续走环境变量或确定性本地回答。
  }

  // 中文注释：保留环境变量兜底，避免没有默认配置时破坏本地和部署环境的既有 AI 行为。
  return resolveOpenAiEnv();
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

function buildCandidateContext(candidates: Candidate[]) {
  return candidates
    .map((item, index) => {
      const displayTags = item.tags.length > 0 ? item.tags : item.topics;
      return [
        `#${index + 1} ${item.fullName}`,
        `语言: ${item.language || "unknown"}`,
        `Stars: ${item.stargazersCount}`,
        `Star时间: ${item.starredAtGithub}`,
        `描述: ${item.description || "无"}`,
        `摘要: ${item.repoSummary || "无"}`,
        `标签: ${displayTags.join(", ") || "无"}`,
      ].join("\n");
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
    if (entry.pattern.test(question)) {
      terms.push(...entry.terms);
    }
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
  if (spec.kind === "question") {
    return `Matched your question directly: "${spec.query}".`;
  }

  if (spec.kind === "heuristic") {
    return `Matched heuristic term: "${spec.query}".`;
  }

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
    const haystack = [
      item.fullName,
      item.description,
      item.repoSummary,
      item.tags.join(" "),
      item.topics.join(" "),
      item.language,
    ]
      .join(" ")
      .toLowerCase();

    return mappedTerms.some((term) => haystack.includes(term));
  });

  return picked.slice(0, 6);
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
    || (metadata.score === existing.score && candidate.stargazersCount > existing.stargazersCount)
  ) {
    merged.set(candidate.id, { ...candidate, ...metadata });
  }
}

async function expandQuestionTermsWithProvider(question: string, config: ChatRuntimeConfig | null) {
  if (!config) return [];

  const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      ...config.extraHeaders,
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "把用户检索意图转成最多6个技术关键词或短语，偏英文，逗号分隔，只输出关键词，不要解释。",
        },
        { role: "user", content: question },
      ],
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
  if (!raw) return [];

  return raw
    .split(/[,\n，、;；]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 40)
    .slice(0, 6);
}

async function pickCandidatesWithProvider(question: string, pool: Candidate[], config: ChatRuntimeConfig | null) {
  if (!config || pool.length === 0) return [];

  const compactPool = pool.slice(0, 30).map((item, index) => ({
    idx: index + 1,
    id: item.id,
    fullName: item.fullName,
    language: item.language,
    summary: item.repoSummary,
    tags: item.tags.length > 0 ? item.tags : item.topics,
  }));

  const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      ...config.extraHeaders,
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content:
            "你是仓库筛选助手。根据用户问题，从候选仓库里选最相关的1到5个，输出JSON：{\"ids\":[\"id1\",\"id2\"]}。只输出JSON。",
        },
        {
          role: "user",
          content: `问题：${question}\n候选池：${JSON.stringify(compactPool)}`,
        },
      ],
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  const raw = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null);
  if (!raw) return [];

  const idsMatch = raw.match(/"ids"\s*:\s*\[([^\]]*)]/);
  if (!idsMatch) return [];
  const ids = idsMatch[1]
    .split(",")
    .map((item) => item.replace(/["'\s]/g, ""))
    .filter(Boolean);
  if (ids.length === 0) return [];

  const byId = new Map(pool.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
}

function toCandidate(item: SearchRepoItem): Candidate {
  return {
    id: item.id,
    fullName: item.fullName,
    description: item.description,
    repoSummary: item.repoSummary,
    topics: item.topics,
    tags: item.tags,
    language: item.language,
    stargazersCount: item.stargazersCount,
    starredAtGithub: item.starredAtGithub,
  };
}

async function recallCandidates(userId: string, question: string, config: ChatRuntimeConfig | null) {
  const querySpecs = uniqueQuerySpecs([
    { query: question, kind: "question" },
    ...buildHeuristicTerms(question).map((query) => ({ query, kind: "heuristic" as const })),
    ...(await expandQuestionTermsWithProvider(question, config)).map((query) => ({ query, kind: "expanded" as const })),
  ]).slice(0, 8);

  const merged = new Map<string, RecalledCandidate>();

  for (const spec of querySpecs) {
    const result = await searchRepos(userId, {
      q: spec.query,
      sort: "relevance",
      page: 1,
      pageSize: 8,
    });

    for (const [index, item] of result.items.entries()) {
      mergeCandidate(merged, toCandidate(item), {
        source: sourceForQueryKind(spec.kind),
        reason: reasonForQuerySpec(spec),
        score: baseScoreForQueryKind(spec.kind) - index * 10,
      });
    }

    if (merged.size >= 10) break;
  }

  let candidates = Array.from(merged.values())
    .sort((left, right) => right.score - left.score || right.stargazersCount - left.stargazersCount)
    .slice(0, 8);

  if (candidates.length === 0) {
    const broadPoolResult = await searchRepos(userId, {
      page: 1,
      pageSize: 80,
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
      candidates = (await pickCandidatesWithProvider(question, broadPool, config)).map((candidate, index) => ({
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

async function askProvider(question: string, candidates: Candidate[], config: ChatRuntimeConfig | null) {
  if (!config) {
    return null;
  }

  const response = await fetch(resolveChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      ...config.extraHeaders,
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "你是仓库检索助手。基于候选仓库给出精炼中文结论：1) 最匹配仓库；2) 一句话理由；3) 若无明显匹配则明确说明。",
        },
        {
          role: "user",
          content: `用户问题：${question}\n\n候选仓库：\n${buildCandidateContext(candidates)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  const content = stripThinkBlocks(payload.choices?.[0]?.message?.content?.trim() ?? null)
    .replace(/\s+/g, " ")
    .trim();
  return content || null;
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));

  if (typeof body.question !== "string" || !body.question.trim()) {
    return fail("invalid_question", "Question is required.");
  }

  const question = body.question.trim();
  const chatConfig = await resolveChatRuntimeConfig(user.id);
  const { candidates, queries } = await recallCandidates(user.id, question, chatConfig);
  const hasCandidates = candidates.length > 0;

  let answer =
    hasCandidates
      ? `已检索到 ${candidates.length} 个匹配仓库，最相关的是 ${candidates[0]?.fullName ?? "未知仓库"}。`
      : `未找到匹配仓库。可尝试这些关键词：${queries.slice(0, 4).join(" / ")}`;

  if (hasCandidates) {
    try {
      const aiAnswer = await askProvider(question, candidates, chatConfig);
      if (aiAnswer) {
        answer = aiAnswer;
      }
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
    })),
    providerConfigId: chatConfig?.id ?? null,
  });
}
