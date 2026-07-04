type FetchLike = typeof fetch;

export type AgentToolContext = {
  apiBaseUrl: string;
  token: string;
  fetch?: FetchLike;
};

export type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

class AgentToolError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AgentToolError";
    this.status = status;
  }
}

const repoProperty = {
  type: "string",
  description: "Starlens repository id or owner/repo full name.",
};

const tagProperty = {
  type: "string",
  description: "User tag to add or remove.",
};

export const agentTools: AgentToolDefinition[] = [
  {
    name: "search_stars",
    description: "Search and filter the user's GitHub starred repositories in Starlens.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query. Optional when filters are provided." },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        sort: { type: "string", enum: ["relevance", "recent", "stars", "updated"] },
        language: { type: "string" },
        owner: { type: "string" },
        tag: { type: "string" },
        favorite: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "show_star",
    description: "Get one starred repository detail by Starlens id or owner/repo.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "sync_stars",
    description: "Trigger GitHub Stars sync for the authenticated Starlens user.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "favorite_star",
    description:
      "Mark a starred repository as favorite. This only sets a local Starlens flag — it does NOT change your real star status on GitHub. Use star_repo/unstar_repo for that.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "unfavorite_star",
    description:
      "Remove favorite state from a starred repository. This only clears a local Starlens flag — it does NOT unstar the repo on GitHub. Use unstar_repo to actually remove a GitHub star.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "star_repo",
    description:
      "Actually star a repository on GitHub (calls the real GitHub star API, not just a local Starlens flag). Accepts any 'owner/repo' — including repos you've never starred before — or an existing Starlens id/fullName (e.g. to re-star a repo you previously unstarred). After starring, the repo is synced into your Starlens collection.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "unstar_repo",
    description:
      "Actually remove your GitHub star from a repository (calls the real GitHub unstar API — the repo will disappear from your GitHub Stars page). This is different from unfavorite_star, which only clears a local Starlens flag and leaves the GitHub star intact. Only works on repos already in your Starlens collection.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "set_star_note",
    description: "Set or clear the user's note for a starred repository.",
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProperty,
        note: { type: "string", description: "Note text. Use an empty string to clear it." },
      },
      required: ["repo", "note"],
      additionalProperties: false,
    },
  },
  {
    name: "add_star_tag",
    description: "Add a user tag to a starred repository.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty, tag: tagProperty },
      required: ["repo", "tag"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_star_tag",
    description: "Remove a user tag from a starred repository.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty, tag: tagProperty },
      required: ["repo", "tag"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_stars",
    description: "Ask Starlens AI to answer a question over the user's starred repositories.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Natural-language question about starred repositories." },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  // 以下 5 个工具采用“触发条件”写法（spec 第 8.2 节），描述何时主动调用而非功能说明。
  {
    name: "analyze_repo",
    description:
      "Call this tool when the user drops a repository (owner/repo) for analysis and you want to surface what the repo is good for and suggest tags/notes. Triggers when the user says 'analyze this repo', 'what is X good for', or pastes a GitHub URL and asks for a summary. Works for both starred and unstarred repos; for unstarred repos it fetches live GitHub data without persisting it. Returns raw repo metadata, README excerpt, and topics. The agent should analyze this data itself to generate suitability assessment, suggested tags, and suggested note — do NOT expect pre-computed AI analysis in the response.",
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProperty,
        applySuggestions: {
          type: "boolean",
          description:
            "Whether to automatically apply suggested tags/note to the user's starred repo. Defaults to false. Set to true only after the user has confirmed the suggestions. Has no effect on unstarred repos. Note: the data endpoint ignores this flag and never applies suggestions — the agent must call add_star_tag / set_star_note itself after analyzing the returned data.",
        },
      },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "recommend_for_task",
    description:
      "Call this tool when the user starts a coding task (new feature, tech selection, research, library comparison) and you want to find relevant libraries or prior art from their GitHub starred repos BEFORE writing code. Triggers when the user says 'I'm going to build X', 'help me pick a library for Y', or describes a task that would benefit from prior starred knowledge. Returns candidate repos ranked by full-text search (ts_rank). The agent should re-rank them by relevance to the task itself — do NOT expect pre-computed AI ranking or reasons in the response.",
    inputSchema: {
      type: "object",
      properties: {
        taskDescription: {
          type: "string",
          description: "Natural-language description of the coding task the user is starting.",
        },
        limit: { type: "integer", minimum: 1, maximum: 30, description: "Max number of recommended repos. Default 10." },
      },
      required: ["taskDescription"],
      additionalProperties: false,
    },
  },
  {
    name: "find_related",
    description:
      "Call this tool when the user mentions a specific repository (owner/repo) and wants to discover related repos they have already starred. Triggers when the user says 'find repos like X', 'what else do I have similar to Y', or when after showing a repo detail the user wants to explore its neighborhood. Returns candidate repos recalled by same owner / language / topics dimensions, with recall reasons. The agent should judge semantic relatedness itself — do NOT expect pre-computed AI relation descriptions in the response.",
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProperty,
        limit: { type: "integer", minimum: 1, maximum: 30, description: "Max number of related repos. Default 10." },
      },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "suggest_organization",
    description:
      "Call this tool when the user mentions organizing, cleaning up, deduplicating, or auditing their starred repo collection. Triggers when the user says 'help me organize my stars', 'find duplicates', 'what's stale', 'which repos have no tags', or 'audit my collection'. Returns suggestions only — does not modify data; the agent must call add_star_tag/remove_star_tag/etc. to apply changes after user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["duplicates", "stale", "untagged", "all"],
          description: "Which kind of organization suggestions to return. Default 'all'.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_sync_summary",
    description:
      "Call this tool at the start of a new session, or when the user asks 'what's new', 'what changed since last sync', or 'show me recent additions to my stars'. Returns a summary of repos added/removed/changed since the last sync (or since an arbitrary timestamp). Use this proactively to give the user context about their recent starred-repo activity without requiring them to ask explicitly.",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description: "Optional ISO 8601 timestamp. Defaults to the user's last sync finished time.",
        },
      },
      additionalProperties: false,
    },
  },
];

function apiBaseUrl(context: AgentToolContext) {
  return context.apiBaseUrl.replace(/\/+$/, "");
}

function textResult(value: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function stringArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentToolError(`${name} is required.`);
  }
  return value.trim();
}

function noteArg(args: Record<string, unknown>) {
  const value = args.note;
  if (typeof value !== "string") {
    throw new AgentToolError("note is required.");
  }

  // 中文注释：备注允许空字符串，用于让 MCP/Agent 明确清空已有备注。
  return value.trim();
}

async function apiRequest<T>(
  path: string,
  {
    body,
    context,
    method = "GET",
    query,
  }: {
    body?: unknown;
    context: AgentToolContext;
    method?: string;
    query?: Record<string, unknown>;
  },
): Promise<T> {
  if (!context.token.trim()) {
    throw new AgentToolError("STARLENS_TOKEN is required.");
  }

  const url = new URL(path, `${apiBaseUrl(context)}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key === "query" ? "q" : key, String(value));
      }
    }
  }

  const fetchImpl = context.fetch ?? fetch;
  const hasBody = body !== undefined;
  const response = await fetchImpl(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${context.token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const payload = (text ? JSON.parse(text) : undefined) as ApiResponse<T> | undefined;

  if (!response.ok || payload?.ok !== true) {
    throw new AgentToolError(
      payload?.ok === false ? payload.error.message : `Starlens API request failed with status ${response.status}.`,
      response.status,
    );
  }

  return payload.data;
}

async function resolveRepo(repoOrId: string, context: AgentToolContext) {
  try {
    return await apiRequest<{ id: string; fullName?: string }>(`/api/repos/${encodeURIComponent(repoOrId)}`, { context });
  } catch (error) {
    if (!(error instanceof AgentToolError) || error.status !== 404) {
      throw error;
    }
  }

  return findRepoBySearch(repoOrId, context);
}

async function findRepoBySearch(repoOrId: string, context: AgentToolContext) {
  const result = await apiRequest<{ items?: Array<{ id: string; fullName?: string }> }>("/api/search", {
    context,
    query: { query: repoOrId, page: 1, pageSize: 10, sort: "relevance" },
  });
  const normalized = repoOrId.toLowerCase();
  const items = result.items ?? [];
  const exact = items.find((repo) => repo.fullName?.toLowerCase() === normalized || repo.id === repoOrId);
  const fallback = exact ?? (items.length === 1 ? items[0] : null);

  if (!fallback?.id) {
    throw new AgentToolError(`Repository was not found: ${repoOrId}`, 404);
  }

  return fallback;
}

async function patchRepo(repoOrId: string, updates: Record<string, unknown>, context: AgentToolContext) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}`, {
      body: updates,
      context,
      method: "PATCH",
    });
  } catch (error) {
    if (!(error instanceof AgentToolError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await findRepoBySearch(repoOrId, context);
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}`, {
    body: updates,
    context,
    method: "PATCH",
  });
}

async function tagRepo(repoOrId: string, tag: string, method: "POST" | "DELETE", context: AgentToolContext) {
  const suffix = method === "POST" ? "tags" : `tags/${encodeURIComponent(tag)}`;
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}/${suffix}`, {
      body: method === "POST" ? { tag } : undefined,
      context,
      method,
    });
  } catch (error) {
    if (!(error instanceof AgentToolError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await findRepoBySearch(repoOrId, context);
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}/${suffix}`, {
    body: method === "POST" ? { tag } : undefined,
    context,
    method,
  });
}

export async function callAgentTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
): Promise<AgentToolResult> {
  switch (name) {
    case "search_stars":
      return textResult(await apiRequest("/api/search", { context, query: args }));
    case "show_star": {
      const repo = stringArg(args, "repo");
      const detail = await resolveRepo(repo, context);
      return textResult(detail);
    }
    case "sync_stars":
      return textResult(await apiRequest("/api/sync", { context, method: "POST" }));
    case "favorite_star":
      return textResult(await patchRepo(stringArg(args, "repo"), { isFavorite: true }, context));
    case "unfavorite_star":
      return textResult(await patchRepo(stringArg(args, "repo"), { isFavorite: false }, context));
    case "set_star_note":
      return textResult(await patchRepo(stringArg(args, "repo"), { note: noteArg(args) }, context));
    case "add_star_tag":
      return textResult(await tagRepo(stringArg(args, "repo"), stringArg(args, "tag"), "POST", context));
    case "remove_star_tag":
      return textResult(await tagRepo(stringArg(args, "repo"), stringArg(args, "tag"), "DELETE", context));
    case "star_repo":
      return textResult(await apiRequest("/api/repos/star", {
        body: { repo: stringArg(args, "repo") },
        context,
        method: "POST",
      }));
    case "unstar_repo":
      return textResult(await apiRequest("/api/repos/unstar", {
        body: { repo: stringArg(args, "repo") },
        context,
        method: "POST",
      }));
    case "ask_stars":
      return textResult(await apiRequest("/api/ai/ask", {
        body: { question: stringArg(args, "question") },
        context,
        method: "POST",
      }));
    // 5 个主动型工具（spec 第 6.1 节）：均通过 apiRequest 复用鉴权/错误处理链。
    // 中文注释：3 个 AI 工具走 /api/repos/*-data 数据端点（不调后端 AI，由 agent 自带模型分析）；
    // /api/ai/* 端点保留给 CLI/Web（无 agent 包裹的场景）。
    case "analyze_repo": {
      // applySuggestions 默认 false——agent 必须先呈现建议给用户、用户确认后才能传 true。
      // 数据端点会忽略 applySuggestions（永不应用），agent 应基于返回的原始数据自行生成建议后调用 add_star_tag/set_star_note。
      const applySuggestions = typeof args.applySuggestions === "boolean" ? args.applySuggestions : false;
      return textResult(await apiRequest("/api/repos/analyze-data", {
        body: { repo: stringArg(args, "repo"), applySuggestions },
        context,
        method: "POST",
      }));
    }
    case "recommend_for_task": {
      const limit = typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(30, Math.max(1, Math.trunc(args.limit)))
        : undefined;
      return textResult(await apiRequest("/api/repos/recommend-data", {
        body: { taskDescription: stringArg(args, "taskDescription"), ...(limit ? { limit } : {}) },
        context,
        method: "POST",
      }));
    }
    case "find_related": {
      const limit = typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(30, Math.max(1, Math.trunc(args.limit)))
        : undefined;
      return textResult(await apiRequest("/api/repos/related-data", {
        body: { repo: stringArg(args, "repo"), ...(limit ? { limit } : {}) },
        context,
        method: "POST",
      }));
    }
    case "suggest_organization": {
      // focus 是可选枚举——非 duplicates/stale/untagged/all 时不传，由路由层降级到默认 'all'。
      const focus = typeof args.focus === "string" && ["duplicates", "stale", "untagged", "all"].includes(args.focus)
        ? args.focus
        : undefined;
      return textResult(await apiRequest("/api/repos/suggestions", {
        context,
        query: focus ? { focus } : undefined,
      }));
    }
    case "get_sync_summary": {
      // since 是可选 ISO 时间戳——非字符串或空字符串时不传，由业务逻辑降级到上次同步时间。
      const sinceRaw = args.since;
      const since = typeof sinceRaw === "string" && sinceRaw.trim() ? sinceRaw.trim() : undefined;
      return textResult(await apiRequest("/api/sync/summary", {
        context,
        query: since ? { since } : undefined,
      }));
    }
    default:
      throw new AgentToolError(`Unknown Starlens agent tool: ${name}`);
  }
}
