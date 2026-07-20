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
      name: "sync_stars",
      description: "立即同步当前用户的 GitHub 收藏到 Starlens。同步会处理所有分页；仅在用户明确要求同步、刷新或更新收藏数据时调用。",
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
  // ─── 写操作工具（低风险，直接执行） ──────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "add_tag",
      description: "给仓库添加标签（本地标记，不影响 GitHub）。标签自动小写归一化，已存在则无操作。",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "仓库 id，来自之前工具结果" },
          tag: { type: "string", description: "标签名" },
        },
        required: ["repoId", "tag"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_tag",
      description: "删除仓库的标签（本地标记，不影响 GitHub）。",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "仓库 id" },
          tag: { type: "string", description: "要删除的标签名" },
        },
        required: ["repoId", "tag"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "设置或更新仓库备注。传空字符串清空备注。",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "仓库 id" },
          note: { type: "string", description: "备注内容，空字符串表示清空" },
        },
        required: ["repoId", "note"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_favorite",
      description: "设置仓库的收藏★标记（Starlens 应用内标记，不影响 GitHub star 本身）。",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "仓库 id" },
          isFavorite: { type: "boolean", description: "true=标记收藏，false=取消收藏" },
        },
        required: ["repoId", "isFavorite"],
        additionalProperties: false,
      },
    },
  },
  // ─── 写操作工具（高风险，不可逆） ──────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "unstar_repo",
      description: "取消 GitHub star（真实调用 GitHub API，不可逆操作）。仅在用户明确要求取消某个仓库的 star 时调用，调用前在回答中复述仓库全名让用户确认意图。repoId 可以是仓库 id 或 owner/repo 全名。",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "仓库 id 或 owner/repo 全名" },
        },
        required: ["repoId"],
        additionalProperties: false,
      },
    },
  },
  // ─── 深度分析工具（只读，基于 DB 召回不做 AI 重排） ──────────────────────────
  {
    type: "function",
    function: {
      name: "recommend_for_task",
      description: "按编码任务描述召回候选仓库（基于全文检索排序）。适用于\"我要做 XX，有哪些仓库可以参考\"类问题。",
      parameters: {
        type: "object",
        properties: {
          taskDescription: { type: "string", description: "编码任务描述，如'我要做一个实时聊天应用'" },
          limit: { type: "integer", description: "返回条数，最多 30，默认 10" },
        },
        required: ["taskDescription"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_related",
      description: "查找与指定仓库相关的其他收藏仓库（按同 owner/同 language/同 topic 三维度召回）。",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string", description: "仓库 id 或 owner/repo 全名" },
          limit: { type: "integer", description: "返回条数，最多 30，默认 10" },
        },
        required: ["repo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_organization",
      description: "扫描收藏仓库，找出重复/过时/未分类三类问题并给出整理建议。不自动修改，只返回建议。",
      parameters: {
        type: "object",
        properties: {
          focus: { type: "string", enum: ["duplicates", "stale", "untagged", "all"], description: "关注的问题类型，默认 all" },
        },
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
  | "sync_stars"
  | "run_readonly_query"
  | "add_tag"
  | "remove_tag"
  | "update_note"
  | "toggle_favorite"
  | "unstar_repo"
  | "recommend_for_task"
  | "find_related"
  | "suggest_organization"
  | "submit_answer";
