# Starlens API 契约文档

> 当前工程参考。最后按 `packages/server/src/routes/` 和
> `skills/starlens/references/http-api.md` 核对：2026-07-11。
> 路由实现是最终权威来源；本文用于稳定跨 Web、Mobile、CLI 和 Agent 的公共约定。

## 1. 文档目标

这份文档用于定义 Starlens `v1` 的 HTTP API 契约，作为前后端、CLI 和 agent 的共同实现依据。

重点明确：

- 鉴权方式
- 通用请求与响应约定
- 主要资源的输入输出结构
- 搜索、同步、AI、token 和配置接口的行为边界

这份文档优先追求 `v1` 可实施，不做过度泛化。

## 2. 基本约定

### 2.1 API 基础路径

所有接口默认挂在：

- `/api/*`

### 2.2 数据格式

- 请求体：`application/json`
- 常规响应体：`application/json`
- AI 多轮对话：`text/event-stream`（SSE）
- 文件上传不在 `v1` 范围内

### 2.3 时间格式

所有时间字段统一使用：

- ISO 8601 字符串

示例：

- `2026-05-05T21:40:00.000Z`

### 2.4 ID 规则

- 应用内资源主键：`uuid`
- GitHub 资源标识：使用字段 `githubRepoId`、`githubUserId` 等单独传递

## 3. 鉴权模型

### 3.1 浏览器端

Web 页面使用 GitHub OAuth 登录后的服务端会话。

适用范围：

- 落地页之外的登录后页面
- 浏览器内发起的 `/api/*` 请求

### 3.2 CLI / Agent

CLI 和 agent 使用 Bearer Token。

请求头格式：

```http
Authorization: Bearer <token>
```

适用范围：

- `stars` CLI
- Hermes / OpenClaw 等 agent

### 3.3 权限边界

`v1` token 默认可访问：

- 搜索
- 查看仓库详情
- 更新标签 / 备注 / 收藏
- 触发同步
- 读取和修改 AI 配置，调用 AI 能力接口

`v1` 不做细粒度权限矩阵，只通过 token 所属用户隔离数据。个人 Token
当前是账号级粗粒度凭据；只有 Token 的创建、列表和撤销接口强制要求浏览器会话。

## 4. 通用响应格式

### 4.1 成功响应

推荐统一结构：

```json
{
  "ok": true,
  "data": {}
}
```

### 4.2 失败响应

推荐统一结构：

```json
{
  "ok": false,
  "error": {
    "code": "string_code",
    "message": "Human readable message"
  }
}
```

### 4.3 分页响应

列表接口建议统一使用：

```json
{
  "ok": true,
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "total": 120,
    "hasMore": true
  }
}
```

`v1` 默认采用页码分页，不先引入 cursor。

## 5. 资源模型摘要

### 5.1 Repo Summary Object

用于搜索结果列表。

```json
{
  "id": "uuid",
  "githubRepoId": 123456,
  "name": "starlens",
  "fullName": "owner/starlens",
  "ownerLogin": "owner",
  "ownerAvatarUrl": "https://...",
  "htmlUrl": "https://github.com/owner/starlens",
  "description": "Original description",
  "repoSummary": "Short generated or extracted summary",
  "language": "TypeScript",
  "topics": ["search", "github", "stars"],
  "stargazersCount": 1200,
  "forksCount": 60,
  "openIssuesCount": 4,
  "isFavorite": true,
  "tags": ["tooling", "search"],
  "hasNote": true,
  "pushedAtGithub": "2026-05-05T12:00:00.000Z",
  "starredAtGithub": "2026-05-01T12:00:00.000Z"
}
```

### 5.2 Repo Detail Object

用于右侧详情面板。

```json
{
  "id": "uuid",
  "githubRepoId": 123456,
  "name": "starlens",
  "fullName": "owner/starlens",
  "ownerLogin": "owner",
  "ownerAvatarUrl": "https://...",
  "htmlUrl": "https://github.com/owner/starlens",
  "description": "Original description",
  "repoSummary": "Short summary",
  "readmeExcerpt": "Excerpt text",
  "aiSummary": "Optional AI-generated summary",
  "repoSummarySource": "github_description",
  "repoSummaryUpdatedAt": "2026-05-05T12:30:00.000Z",
  "readmeExcerptSource": "github_readme_excerpt",
  "readmeExcerptUpdatedAt": "2026-05-05T12:30:00.000Z",
  "searchDocumentSource": "repo_metadata",
  "searchDocumentUpdatedAt": "2026-05-05T12:30:00.000Z",
  "topics": ["search", "github", "stars"],
  "language": "TypeScript",
  "license": {
    "key": "mit",
    "name": "MIT License"
  },
  "licenseName": "MIT License",
  "defaultBranch": "main",
  "visibility": "public",
  "archived": false,
  "disabled": false,
  "isFork": false,
  "stargazersCount": 1200,
  "forksCount": 60,
  "watchersCount": 1200,
  "openIssuesCount": 4,
  "homepage": "https://...",
  "isFavorite": true,
  "tags": ["tooling", "search"],
  "note": "My personal note",
  "createdAtGithub": "2025-01-01T00:00:00.000Z",
  "updatedAtGithub": "2026-05-01T00:00:00.000Z",
  "pushedAtGithub": "2026-05-05T12:00:00.000Z",
  "starredAtGithub": "2026-05-01T12:00:00.000Z",
  "lastSyncedAt": "2026-05-05T12:30:00.000Z"
}
```

### 5.3 AI Config Object

```json
{
  "id": "uuid",
  "displayName": "My DeepSeek Gateway",
  "providerType": "openai_compatible",
  "model": "deepseek-chat",
  "baseUrl": "https://...",
  "enabled": true,
  "isDefault": false,
  "lastValidatedAt": "2026-05-05T12:30:00.000Z",
  "lastValidationStatus": "success",
  "lastValidationError": null
}
```

### 5.4 Token Object

```json
{
  "id": "uuid",
  "name": "CLI on MacBook",
  "note": "Used by my laptop",
  "tokenPrefix": "stl_abc",
  "tokenSuffix": "xyz123",
  "lastUsedAt": "2026-05-05T10:00:00.000Z",
  "expiresAt": null,
  "revokedAt": null,
  "createdAt": "2026-05-01T10:00:00.000Z"
}
```

## 6. 接口定义

### 6.1 `POST /api/sync`

用途：

- 为当前用户触发一次手动同步

请求体：

```json
{}
```

响应（每次请求处理一页，客户端可按 `continuation` 继续）：

```json
{
  "ok": true,
  "data": {
    "runId": "1b4db98e-f74a-44f1-b772-2f34554dfcd6",
    "status": "running",
    "startedAt": "2026-05-05T12:00:00.000Z",
    "finishedAt": null,
    "durationMs": 800,
    "nextPage": 2,
    "pageCount": 1,
    "failedCount": 0,
    "errorSummary": null,
    "errorLevel": null,
    "counts": {
      "fetched": 25,
      "insertedOrUpdated": 25,
      "unstarred": 0
    },
    "continuation": {
      "required": true,
      "nextRequestAfterMs": 150
    },
    "history": [
      {
        "id": "1b4db98e-f74a-44f1-b772-2f34554dfcd6",
        "status": "running",
        "startedAt": "2026-05-05T12:00:00.000Z",
        "finishedAt": null
      }
    ]
  }
}
```

完成时会返回：

```json
{
  "ok": true,
  "data": {
    "status": "success",
    "finishedAt": "2026-05-05T12:00:03.000Z",
    "continuation": {
      "required": false,
      "nextRequestAfterMs": null
    }
  }
}
```

说明：

- 每次请求最多处理 25 个收藏；当 `status` 为 `running` 或 `continuation.required` 为 `true` 时，调用方应在 `nextRequestAfterMs` 后再次 `POST /api/sync`。Web、Mobile、CLI 和 Agent 工具已自动执行该续跑逻辑。
- 同步进度与历史记录保存在数据库的 `sync_runs` 表中。刷新页面、实例重启或重新发起同步后，均会从已完成页继续。
- 同步业务失败仍返回 `{ ok: true, data: { status: "error", ... } }`，调用方必须检查 `data.status`。下一次手动触发会恢复同一任务；未连接 GitHub 账号等前置错误不创建任务。

### 6.1.1 `GET /api/sync`

用途：

- 获取当前用户最近同步任务；`latest` 为最近一次任务，`history` 最多保留 8 条。

### 6.2 `GET /api/search`

用途：

- 搜索和过滤 starred repos

查询参数：

- `q`：搜索词，可空
- `page`：默认 `1`
- `pageSize`：默认 `20`
- `language`：可空
- `owner`：可空
- `tag`：可空
- `favorite`：`true|false` 可空
- `sort`：默认 `recent`
- `minStars` / `maxStars`：非负整数，按仓库 Star 数区间过滤
- `starredAfter` / `starredBefore`：可被 `Date` 解析的时间，按用户收藏时间过滤
- `pushedAfter`：可被 `Date` 解析的时间，按仓库最近推送时间过滤
- `hasNote`：`true|false`，按是否存在非空备注过滤
- `noteContains`：备注内容的模糊匹配关键词

允许的 `sort`：

- `relevance`
- `recent`
- `stars`
- `updated`

响应：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "fullName": "owner/repo",
        "ownerLogin": "owner",
        "repoSummary": "Short summary",
        "language": "TypeScript",
        "stargazersCount": 1000,
        "isFavorite": false,
        "tags": ["tooling"],
        "hasNote": true,
        "pushedAtGithub": "2026-05-05T12:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "hasMore": false
  }
}
```

### 6.3 `GET /api/repos/:id`

用途：

- 获取单个仓库详情

路径参数：

- `id`：`starred_repos.id`

响应：

- `Repo Detail Object`

### 6.4 `PATCH /api/repos/:id`

用途：

- 更新用户私有整理字段

允许更新字段：

- `isFavorite`
- `note`

请求体：

```json
{
  "isFavorite": true,
  "note": "Investigate later"
}
```

响应：

- 返回更新后的 `Repo Detail Object`

说明：

- `v1` 不通过这个接口更新 GitHub 原生字段

### 6.5 `POST /api/repos/:id/tags`

用途：

- 为某个仓库新增标签

请求体：

```json
{
  "tag": "search"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "tags": ["search", "tooling"]
  }
}
```

### 6.6 `DELETE /api/repos/:id/tags/:tag`

用途：

- 删除某个仓库上的标签

响应：

```json
{
  "ok": true,
  "data": {
    "tags": ["tooling"]
  }
}
```

## 7. Token 管理接口

### 7.1 `GET /api/tokens`

用途：

- 返回当前用户的 token 列表

响应：

- `Token Object[]`

### 7.2 `POST /api/tokens`

用途：

- 创建一个新的 CLI / agent token

请求体：

```json
{
  "name": "CLI on MacBook",
  "note": "Used by my laptop"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "token": "stl_xxx_generated_once",
    "id": "uuid",
    "name": "CLI on MacBook",
    "note": "Used by my laptop",
    "tokenPrefix": "stl_xxx",
    "tokenSuffix": "xyz123",
    "lastUsedAt": null,
    "expiresAt": null,
    "revokedAt": null,
    "createdAt": "2026-05-05T12:00:00.000Z"
  }
}
```

说明：

- 明文 token 只在创建时返回一次
- Token 管理接口只面向浏览器会话；CLI / agent 使用 Bearer Token 调用业务接口，不允许用 Bearer Token 继续签发新 token

### 7.3 `DELETE /api/tokens/:id`

用途：

- 撤销某个 token

响应：

```json
{
  "ok": true,
  "data": {
    "revoked": true
  }
}
```

## 8. AI Provider 配置接口

### 8.1 `GET /api/ai/configs`

用途：

- 获取当前用户全部 AI 配置

响应：

- `AI Config Object[]`

### 8.2 `POST /api/ai/configs`

用途：

- 新增 AI provider 配置

请求体示例：

```json
{
  "displayName": "My Anthropic",
  "providerType": "anthropic_native",
  "model": "claude-sonnet-4.5",
  "baseUrl": null,
  "apiKey": "secret",
  "enabled": true,
  "isDefault": true
}
```

说明：

- `providerType` 允许值：
  - `openai_compatible`
  - `anthropic_native`
  - `gemini_native`
  - `deepseek_native`

响应：

- 返回创建后的 `AI Config Object`

说明：

- `apiKey` 只在请求中接收，服务端加密保存，响应中不返回明文
- 如果 `isDefault = true`，同一用户其他配置会自动取消默认状态
- 当前问答运行时只使用 `openai_compatible` Chat Completions；Native 类型用于配置和模型列表验证

### 8.3 `PATCH /api/ai/configs/:id`

用途：

- 更新现有 AI 配置

允许更新字段：

- `displayName`
- `model`
- `baseUrl`
- `apiKey`
- `enabled`
- `isDefault`
- `extraHeaders`

响应：

- 返回更新后的 `AI Config Object`

说明：

- 传入新的 `apiKey` 会覆盖旧密钥；不传则保留旧密钥
- 传入 `apiKey: null` 或空字符串表示清空密钥

### 8.4 `DELETE /api/ai/configs/:id`

用途：

- 删除 AI 配置

响应：

```json
{
  "ok": true,
  "data": {
    "deleted": true
  }
}
```

### 8.5 `POST /api/ai/configs/:id/validate`

用途：

- 校验当前 provider 是否可用

请求体：

```json
{}
```

响应：

```json
{
  "ok": true,
  "data": {
    "status": "success",
    "validatedAt": "2026-05-05T12:00:00.000Z",
    "message": "Provider validation succeeded."
  }
}
```

校验失败时仍返回结构化结果，并同步写回 `lastValidationStatus` 与 `lastValidationError`：

```json
{
  "ok": true,
  "data": {
    "status": "error",
    "validatedAt": "2026-05-05T12:00:00.000Z",
    "message": "Provider validation failed with status 401."
  }
}
```

### 8.6 `GET /api/ai/configs/:id/models`

用途：

- 尝试获取某个 provider 可用模型列表

响应：

```json
{
  "ok": true,
  "data": {
    "models": [
      {
        "id": "deepseek-chat",
        "label": "deepseek-chat"
      }
    ],
    "source": "provider"
  }
}
```

说明：

- 如果 provider 不支持动态拉取，返回空数组并标记手动输入模式

建议返回：

```json
{
  "ok": true,
  "data": {
    "models": [],
    "source": "manual_only"
  }
}
```

## 9. AI 能力接口

### 9.1 `POST /api/ai/ask`

用途：

- 使用工具调用 Agent 对用户仓库进行一次性自然语言问答

请求体：

```json
{
  "question": "我之前收藏过一个做 React 表格虚拟滚动的库，帮我找找"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "answer": "Most likely candidates are ...",
    "candidates": [
      {
        "id": "uuid",
        "fullName": "owner/repo",
        "reason": "Matches React table virtualization use case",
        "source": "search",
        "score": 0.92
      }
    ],
    "providerConfigId": "uuid-or-system-default-id",
    "providerConfigSource": "user_default"
  }
}
```

说明：

- Agent 可组合 `search_repos`、`get_repo_detail`、`get_repo_stats`、`run_readonly_query`、任务推荐、关联发现、整理建议和受控写操作工具。
- 最终答案必须通过 `submit_answer` 提交，只能引用本轮工具结果中真实出现过的仓库 ID。
- `run_readonly_query` 只允许读取 `starred_repos`、`repo_tags` 和 `repo_notes`，并由数据库只读角色与 RLS 隔离用户数据。
- 问答需要支持 OpenAI-compatible tool calling 的可用 Provider；失败时返回 `ask_failed`，不会拼接不确定的兜底答案。

### 9.2 `POST /api/ai/rerank`

用途：

- 对候选仓库进行 AI 重排

请求体：

```json
{
  "query": "React table virtualization",
  "providerConfigId": "uuid",
  "repoIds": ["uuid1", "uuid2", "uuid3"]
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "repoId": "uuid1",
        "rank": 1,
        "reason": "Closest match"
      }
    ]
  }
}
```

### 9.3 `POST /api/ai/summarize`

用途：

- 为单个仓库生成 AI 摘要

请求体：

```json
{
  "repoId": "uuid",
  "providerConfigId": "uuid"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "repoId": "uuid",
    "summary": "This repository focuses on ..."
  }
}
```

### 9.4 `POST /api/ai/chat`

用途：

- 发起或继续一段持久化的多轮 AI 对话。
- 通过 SSE 发送执行事件、错误事件和最终回答。

请求体：

```json
{
  "question": "最近收藏的本地 Agent 框架有哪些？",
  "conversationId": "optional-uuid",
  "regenerate": false
}
```

响应头：

```http
Content-Type: text/event-stream
X-Conversation-Id: <uuid>
Cache-Control: no-cache
```

事件格式：

```text
data: {"type":"tool_start","tool":"search_repos"}

data: {"type":"done","answer":"...","candidates":[]}
```

说明：

- 新对话省略 `conversationId`，服务端创建会话并通过 `X-Conversation-Id` 返回 ID。
- `regenerate=true` 会删除该会话最后一条 assistant 消息，并重新生成最后一个问题的回答。
- SSE 用于实时传递执行事件和最终结果；上游 Provider 不保证逐 token 输出，客户端可能对最终答案使用打字机展示。
- 消息会持久化到 `conversations` 和 `chat_messages`。

### 9.5 `/api/ai/chat/conversations`

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/ai/chat/conversations?limit=30&offset=0` | 按更新时间倒序列出会话，`limit` 范围为 1–100 |
| `POST` | `/api/ai/chat/conversations` | 创建空会话，可选请求体 `{ "title": "..." }` |
| `GET` | `/api/ai/chat/conversations/:id` | 返回会话元数据及最多 200 条消息 |
| `PATCH` | `/api/ai/chat/conversations/:id` | 使用 `{ "title": "..." }` 修改标题 |
| `DELETE` | `/api/ai/chat/conversations/:id` | 删除会话并级联删除消息 |

## 10. 错误码建议

建议统一使用以下错误码集合：

- `unauthorized`
- `forbidden`
- `not_found`
- `validation_error`
- `sync_already_running`
- `provider_auth_failed`
- `provider_timeout`
- `provider_model_not_found`
- `provider_unreachable`
- `provider_quota_exceeded`
- `internal_error`

## 11. v1 明确不做

- GraphQL 风格 API
- Cursor 分页
- 批量 mutation 接口
- Webhook 回调接口
- 公共匿名 API
- WebSocket 对话协议（当前只提供 SSE）
- 复杂 token scope 权限模型

## 12. 当前默认决策

- 浏览器使用会话鉴权，CLI / agent 使用 Bearer Token
- API 响应统一采用 `{ ok, data }` / `{ ok, error }`
- 搜索接口使用页码分页
- repo 更新接口只允许改用户私有字段
- AI 调用统一由服务端代理发起
- AI 问答必须先经过数据库候选召回
- 多轮聊天使用 SSE，历史消息持久化到 PostgreSQL

## 13. v1.x 新增接口（截至 2026-07-11）

以下接口在初版契约之后新增，均遵循第 4 节的通用响应格式；完整请求/响应示例见 `skills/starlens/references/http-api.md`（agent skill 的权威参考，随代码同步维护），此处仅记录路由清单和用途摘要：

- `POST /api/repos/star` / `POST /api/repos/unstar` — 真实调用 GitHub API 修改用户的 GitHub star 状态（区别于 `PATCH /api/repos/:id` 的本地 `isFavorite` 标记）
- `GET /api/repos/suggestions` — 知识整理建议（重复 / 过时 / 未分类），纯 DB 聚合，不调 AI
- `GET /api/sync/summary` — 返回指定时间之后检测到的新增 / 取消 Star 摘要。当前根据 `last_synced_at` 和 `unstarred_at` 推断，`added` 可能包含元数据更新，`changed` 暂为空
- `POST /api/ai/analyze` — 仓库分析 + AI 生成标签/备注建议（CLI / Web 入口）
- `POST /api/ai/recommend` — 基于任务描述做 AI 重排的仓库推荐（CLI / Web 入口）
- `POST /api/ai/related` — 基于给定仓库做 AI 重排的关联仓库发现（CLI / Web 入口）
- `POST /api/repos/analyze-data` / `POST /api/repos/recommend-data` / `POST /api/repos/related-data` — 上述三个接口的 **数据版**（agent/MCP 场景），不调后端 AI、不消耗 AI 配额，只返回原始 DB/GitHub 数据供调用方自行分析重排
- `POST /api/ai/chat` 与 `/api/ai/chat/conversations/*` — SSE 多轮聊天和会话历史管理，详见 9.4–9.5
