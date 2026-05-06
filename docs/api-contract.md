# Starlens API 契约文档

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
- 响应体：`application/json`
- 文件上传和流式响应不在 `v1` 范围内

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
- 访问 AI 配置读取和 AI 能力接口

`v1` 不做细粒度权限矩阵，只通过 token 所属用户隔离数据。

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
  "tokenPrefix": "stl_abc",
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

响应：

```json
{
  "ok": true,
  "data": {
    "status": "started",
    "startedAt": "2026-05-05T12:00:00.000Z"
  }
}
```

说明：

- `v1` 先定义为“触发同步任务”
- 不要求阻塞直到全部同步完成

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
- `sort`：默认 `relevance`

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
  "name": "CLI on MacBook"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "token": "stl_xxx_generated_once",
    "tokenMeta": {
      "id": "uuid",
      "name": "CLI on MacBook",
      "tokenPrefix": "stl_xxx",
      "createdAt": "2026-05-05T12:00:00.000Z"
    }
  }
}
```

说明：

- 明文 token 只在创建时返回一次

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
  - `vercel_gateway`
  - `openai_compatible`
  - `anthropic_native`
  - `gemini_native`

响应：

- 返回创建后的 `AI Config Object`

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
    "validatedAt": "2026-05-05T12:00:00.000Z"
  }
}
```

失败示例：

```json
{
  "ok": false,
  "error": {
    "code": "provider_auth_failed",
    "message": "Authentication failed for provider"
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

- 基于候选仓库进行自然语言问答

请求体：

```json
{
  "question": "我之前收藏过一个做 React 表格虚拟滚动的库，帮我找找",
  "providerConfigId": "uuid",
  "modelOverride": null,
  "search": {
    "q": "react table virtualized",
    "favorite": null,
    "language": "TypeScript"
  }
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "answer": "Most likely candidates are ...",
    "matches": [
      {
        "repoId": "uuid",
        "fullName": "owner/repo",
        "reason": "Matches React table virtualization use case"
      }
    ]
  }
}
```

说明：

- 服务端必须先做数据库召回，再把候选仓库交给 AI
- 不允许 AI 直接替代数据库主搜索链路

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
- 流式 AI 输出协议
- 复杂 token scope 权限模型

## 12. 当前默认决策

- 浏览器使用会话鉴权，CLI / agent 使用 Bearer Token
- API 响应统一采用 `{ ok, data }` / `{ ok, error }`
- 搜索接口使用页码分页
- repo 更新接口只允许改用户私有字段
- AI 调用统一由服务端代理发起
- AI 问答必须先经过数据库候选召回
