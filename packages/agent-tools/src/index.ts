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
    description: "Mark a starred repository as favorite.",
    inputSchema: {
      type: "object",
      properties: { repo: repoProperty },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "unfavorite_star",
    description: "Remove favorite state from a starred repository.",
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
    case "ask_stars":
      return textResult(await apiRequest("/api/ai/ask", {
        body: { question: stringArg(args, "question") },
        context,
        method: "POST",
      }));
    default:
      throw new AgentToolError(`Unknown Starlens agent tool: ${name}`);
  }
}
