// 中文注释：给 AI Agent 用的工具定义，OpenAI chat completions `tools` 参数格式。
// search_repos / get_repo_detail / get_repo_stats 是主力路径（覆盖大多数真实问题，
// 失败面小、可靠性高）；run_readonly_query 是长尾兜底（复杂过滤/聚合/join，固定工具表达不了时才用），
// 走的是数据库层只读角色 + RLS 隔离，见 sql-executor.ts。submit_answer 是终止工具。

const SORT_ENUM = ["relevance", "recent", "stars", "updated"] as const;

export const agentToolSchemas = [
  {
    type: "function",
    function: {
      name: "search_repos",
      description:
        "搜索/过滤用户的 GitHub 收藏仓库。这是首选工具，覆盖绝大多数问题（按语言/所有者/标签/收藏状态/star数区间/收藏时间/推送时间/备注过滤、排序、关键词全文检索）。",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "全文检索关键词，留空表示不按关键词过滤" },
          sort: { type: "string", enum: SORT_ENUM, description: "relevance=相关性 recent=按收藏时间降序 stars=按star数降序 updated=按最近推送时间降序" },
          language: { type: "string", description: "编程语言，小写英文，如 python" },
          owner: { type: "string", description: "GitHub 用户名/组织名" },
          tag: { type: "string", description: "用户自己打的标签" },
          favorite: { type: "boolean", description: "true 表示只看用户在 Starlens 里额外标记过的\"收藏★\"，跟 GitHub star 本身是两回事——除非用户明确提到\"收藏★\"这个应用内功能，否则不要设置这个字段" },
          minStars: { type: "integer", description: "star 数下限" },
          maxStars: { type: "integer", description: "star 数上限" },
          starredAfter: { type: "string", description: "ISO 日期，仓库 star 时间下限" },
          starredBefore: { type: "string", description: "ISO 日期，仓库 star 时间上限" },
          pushedAfter: { type: "string", description: "ISO 日期，仓库最后推送时间下限" },
          hasNote: { type: "boolean", description: "true 表示只看写过备注的仓库" },
          noteContains: { type: "string", description: "备注内容包含的关键词" },
          pageSize: { type: "integer", description: "返回条数，最多 20，默认 10" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_repo_detail",
      description: "获取某个仓库的完整详情（README摘要、AI总结、备注、标签等）。repoId 必须是之前工具调用结果里出现过的真实 id，不能瞎编。",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "仓库 id，来自 search_repos 或 run_readonly_query 的结果" },
        },
        required: ["repoId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_repo_stats",
      description: "获取用户收藏仓库的整体统计（总数、语言分布、收藏★数量、star最多的仓库、月度趋势）。注意：返回结果里的仓库不带 id，如果之后要具体引用某个仓库，需要再调 search_repos 或 get_repo_detail 补一个 id。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "run_readonly_query",
      description:
        "长尾兜底工具：只有当 search_repos 的参数表达不了你需要的过滤/聚合/排序逻辑时才用（比如复杂的多条件组合、按标签数量分组统计这类）。只能写单条 SELECT（或 WITH ... SELECT）语句，只能查 starred_repos / repo_tags / repo_notes 三张表（数据库权限层面强制隔离到当前用户自己的数据，即使 SQL 里完全不写 WHERE user_id 也一样，不需要也不应该自己拼 user_id 过滤）。禁止任何写操作，禁止访问其他表。starred_repos 主要字段：id, full_name, owner_login, description, language, stargazers_count, topics(jsonb), is_favorite, starred_at_github, pushed_at_github, repo_summary, ai_summary。repo_tags: starred_repo_id, tag。repo_notes: starred_repo_id, note。",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "单条只读 SELECT 语句" },
        },
        required: ["sql"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_answer",
      description: "终止工具，必须以调用这个工具结束整个流程。answer 是给用户看的最终中文回答；repoIds 是本次回答里要展示的相关仓库 id 列表（最多 15 个），必须是之前工具结果里真实出现过的 id，不能编。",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string", description: "最终中文回答，简洁、基于真实检索到的数据" },
          repoIds: { type: "array", items: { type: "string" }, description: "要展示的仓库 id 列表，最多 15 个，可以为空数组" },
        },
        required: ["answer"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type AgentToolName =
  | "search_repos"
  | "get_repo_detail"
  | "get_repo_stats"
  | "run_readonly_query"
  | "submit_answer";
