// 意图识别与结构化解析
// 负责：将用户自然语言问题转换为结构化 QueryIntent

import type { ChatRuntimeConfig, QueryIntent, StructuredIntent } from "./types";
import { resolveChatCompletionsUrl, stripThinkBlocks, wrapUserQuestion } from "./provider";
import type { OpenAiCompatibleResponse } from "./types";
import { guardedFetch } from "@starlens/server/server/security/url-guard";

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
    const response = await guardedFetch(resolveChatCompletionsUrl(config.baseUrl), {
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

export async function detectQueryIntent(question: string, config: ChatRuntimeConfig | null): Promise<QueryIntent> {
  if (config) {
    return detectQueryIntentByAI(question, config);
  }
  return { kind: "semantic" };
}
