# StarLens HTTP API

All endpoints are relative to `STARLENS_API_BASE_URL`.

## Response Envelope

Successful responses use:

```json
{ "ok": true, "data": {} }
```

Failed responses use:

```json
{ "ok": false, "error": { "code": "string", "message": "string" } }
```

If `ok` is not `true`, treat the request as failed even when the HTTP status is unexpected.

## Authentication

Use a personal StarLens API token:

```http
Authorization: Bearer stl_xxx
Accept: application/json
```

## Search Stars

`GET /api/search`

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `q` | string | Keyword, topic, repo name, owner, or natural query. |
| `page` | integer | Defaults to `1`. |
| `pageSize` | integer | Use `10` to `20` for agent answers. |
| `sort` | string | `relevance`, `recent`, `stars`, or `updated`. |
| `language` | string | Filter by repository language. |
| `owner` | string | Filter by GitHub owner. |
| `tag` | string | Filter by StarLens tag. |
| `favorite` | boolean | Filter favorites. |

Use this endpoint before detail lookup when the user provides a topic, partial name, or ambiguous repository reference.

## Repository Detail

`GET /api/repos/{idOrFullName}`

`idOrFullName` can be a StarLens repository id or `owner/repo`. If it returns 404, search the same text with `/api/search` before giving up.

## Sync Stars

`POST /api/sync`

Trigger GitHub Stars sync for the authenticated StarLens user. Use only when the user asks to refresh or sync.

## Update Repository State

`PATCH /api/repos/{idOrFullName}`

Body fields:

```json
{
  "isFavorite": true,
  "note": "Short user note"
}
```

Send only fields that should change. Use an empty `note` string only when the user asks to clear a note.

⚠️ `isFavorite` here is a **local Starlens flag only** — it does NOT star/unstar the repo on GitHub. Use `POST /api/repos/star` / `POST /api/repos/unstar` below to change the user's real GitHub star status.

## Star / Unstar on GitHub

`POST /api/repos/star`

Actually stars a repository on GitHub (calls `PUT /user/starred/{owner}/{repo}` on the user's behalf). Accepts any `owner/repo` — including repos the user has never starred before — or an existing Starlens id/fullName (e.g. to re-star a repo previously unstarred). On success, the repo is synced into the user's Starlens collection and the updated repo detail is returned.

Request body:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `repo` | string | yes | `owner/repo`, or a Starlens repository id/fullName. |

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/repos/star" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"repo":"facebook/react"}'
```

`POST /api/repos/unstar`

Actually removes the user's GitHub star from a repository (calls `DELETE /user/starred/{owner}/{repo}`). The repo will disappear from the user's real GitHub Stars page — this cannot be undone through Starlens. Only works on repos already in the user's Starlens collection (404 otherwise).

Request body:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `repo` | string | yes | `owner/repo`, or a Starlens repository id/fullName. |

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/repos/unstar" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"repo":"owner/abandoned-repo"}'
```

Both endpoints return `{ "ok": false, "error": { "code": "forbidden_scope", "message": "..." } }` with HTTP 403 when the user's GitHub OAuth token lacks the `public_repo` scope — tell the user to log out and back in to Starlens to re-authorize. A `not_found` (404) error means the repo doesn't exist on GitHub (star) or isn't in the user's Starlens collection (unstar).

Before calling `unstar` in bulk (e.g. as a follow-up to a cleanup/organization request), always list the exact repos to the user and get explicit confirmation first — this is a real, irreversible-via-Starlens action on their GitHub account.

## Tags

Add a tag:

`POST /api/repos/{idOrFullName}/tags`

```json
{ "tag": "rag" }
```

Remove a tag:

`DELETE /api/repos/{idOrFullName}/tags/{tag}`

## AI Ask

`POST /api/ai/ask`

```json
{ "question": "哪些 starred repos 适合做本地 RAG 原型？" }
```

Use this endpoint for synthesis, comparison, recommendations, and natural-language questions over the user's starred repositories.

The server chooses the user's default AI Provider first and falls back to the system default AI configuration when no user default is available.

## AI Recommend For Task

`POST /api/ai/recommend`

编码任务参考。基于任务描述，从用户 starred_repos 召回相关仓库（全文检索 + AI 重排）。冷启动（用户从未同步）时返回 `meta.empty: true`，agent 应引导用户先调用 `sync_stars`。

Request body:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `taskDescription` | string | yes | 任务描述，自然语言。 |
| `limit` | integer | no | 默认 `10`，最大 `30`。 |

Example request:

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/recommend" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"taskDescription":"实现一个本地 RAG 原型，需要向量检索和 embedding","limit":10}'
```

Response:

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "repo": {
          "id": 456,
          "fullName": "chroma-core/chroma",
          "description": "the AI-native open-source embedding database",
          "stargazersCount": 12000,
          "language": "Python",
          "topics": ["vector-database", "embeddings", "rag"]
        },
        "reason": "向量数据库，适合 RAG 检索层"
      }
    ],
    "meta": {
      "rateLimit": { "remaining": 17, "resetAt": "2026-07-04T10:00:00Z" },
      "empty": false
    },
    "suggestedNextActions": [
      { "tool": "show_star", "args": { "repo": "chroma-core/chroma" }, "reason": "查看完整详情" }
    ],
    "reasoningHints": "基于任务描述中 'vector' 和 'embedding' 关键词匹配到 3 个相关仓库"
  }
}
```

Use this endpoint when the user starts a coding task (new feature, tech selection, research) to surface prior art from their stars before writing code.

## AI Find Related

`POST /api/ai/related`

关联仓库发现。给定一个仓库，从用户 starred_repos 中找出相关的（同 owner、同 topic、同语言、AI 语义相似）。冷启动时返回 `meta.empty: true`。

Request body:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `repo` | string | yes | `owner/repo` 或 StarLens repository id。 |
| `limit` | integer | no | 默认 `10`。 |

Example request:

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/related" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"repo":"chroma-core/chroma","limit":10}'
```

Response:

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "repo": {
          "id": 789,
          "fullName": "langchain-ai/langchain",
          "description": "Build context-aware reasoning applications",
          "stargazersCount": 85000,
          "language": "Python"
        },
        "relation": "same_topic:rag"
      }
    ],
    "meta": {
      "rateLimit": { "remaining": 16, "resetAt": "2026-07-04T10:00:00Z" },
      "empty": false
    },
    "reasoningHints": "基于 topic 'rag' 和共享语言 Python 召回"
  }
}
```

Use this endpoint when the user names a specific repository and wants to discover related stars in their collection.

## AI Analyze Repo

`POST /api/ai/analyze`

仓库分析 + 智能标注。已 star 仓库用本地数据 + AI 分析；未 star 仓库实时拉 GitHub（`GET /repos/{owner}/{repo}` + `GET /repos/{owner}/{repo}/readme`）。默认仅返回建议（`applySuggestions=false`），agent 先呈现给用户，用户确认后再调用一次 `applySuggestions=true` 应用（仅对已 star 仓库有效；未 star 仓库返回 `applied: false` 并提示先 star）。

Request body:

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `repo` | string | yes | `owner/repo` 或 StarLens repository id。 |
| `applySuggestions` | boolean | no | 默认 `false`。`true` 时自动应用 `suggestedTags` 和 `suggestedNote`（仅对已 star 仓库有效）。 |

Example request:

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/analyze" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"repo":"vercel/next.js","applySuggestions":false}'
```

Response:

```json
{
  "ok": true,
  "data": {
    "repo": {
      "id": 123,
      "fullName": "vercel/next.js",
      "description": "The React Framework for the Web",
      "stargazersCount": 120000,
      "language": "TypeScript",
      "topics": ["react", "ssr", "framework"]
    },
    "summary": "Next.js 是基于 React 的全栈框架，支持 SSR/SSG/RSC。",
    "suitableFor": "React 全栈应用、SSR/SSG 站点、需要文件路由的项目",
    "suggestedTags": ["react", "framework", "ssr"],
    "suggestedNote": "主流 React 全栈框架，文件路由 + RSC 支持",
    "isStarred": true,
    "applied": false,
    "meta": {
      "rateLimit": { "remaining": 18, "resetAt": "2026-07-04T10:00:00Z" },
      "empty": false
    },
    "suggestedNextActions": [
      { "tool": "add_star_tag", "args": { "repo": "vercel/next.js", "tag": "framework" }, "reason": "属于框架类标签" }
    ],
    "reasoningHints": "基于仓库 description、topics 和 readme_excerpt 生成标签与适用场景"
  }
}
```

Use this endpoint when the user drops a repository for analysis, or asks "what is this repo good for". For unstarred repos, the live GitHub fetch result is NOT persisted; to save tags/notes, star the repo first.

## Repo Suggestions

`GET /api/repos/suggestions`

知识整理建议。扫描 starred_repos，返回重复、过时、未分类建议。纯 DB 聚合，无 AI 调用。不自动修改数据，agent 引导用户逐项确认后调用 `add_star_tag` 等工具应用。冷启动时返回 `meta.empty: true`。

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `focus` | string | `duplicates` / `stale` / `untagged` / `all`（默认 `all`）。 |

- `duplicates`：同 owner + name 重复条目
- `stale`：`pushed_at` 超过 2 年
- `untagged`：`user_tags` 为空且 `stargazers_count` 高（默认 > 1000）
- `all`：上述全部

Example request:

```bash
curl "$STARLENS_API_BASE_URL/api/repos/suggestions?focus=all" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json"
```

Response:

```json
{
  "ok": true,
  "data": {
    "suggestions": [
      {
        "repoId": 123,
        "repoFullName": "owner/repo",
        "issue": "untagged",
        "suggestion": "高 star 仓库但无标签，建议添加 'framework' 标签"
      },
      {
        "repoId": 456,
        "repoFullName": "old/abandoned",
        "issue": "stale",
        "suggestion": "pushed_at 超过 2 年，考虑取消收藏或归档"
      }
    ],
    "meta": {
      "empty": false,
      "counts": { "duplicates": 0, "stale": 3, "untagged": 12 }
    }
  }
}
```

Use this endpoint when the user mentions organizing, cleaning up, deduplicating, or reviewing their starred collection. After presenting suggestions, apply them one by one with user confirmation.

## Sync Summary

`GET /api/sync/summary`

同步变化摘要。返回最近一次同步的新增 / 消失 / 变化仓库。Pull-based，agent 在新会话或用户问"最近变化"时主动调用。数据来源为 `sync_changes` 表（在 sync 流程中对比前后快照写入）。

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `since` | string (ISO 8601 timestamp) | 可选。默认取上次同步时间。 |

Example request:

```bash
curl "$STARLENS_API_BASE_URL/api/sync/summary" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json"
```

Response:

```json
{
  "ok": true,
  "data": {
    "lastSyncAt": "2026-07-03T10:00:00Z",
    "added": [
      { "repoFullName": "new/repo", "stargazersCount": 5000 }
    ],
    "removed": [
      { "repoFullName": "gone/repo" }
    ],
    "changed": [
      {
        "repoFullName": "updated/repo",
        "changes": {
          "stargazersCount": { "from": 1000, "to": 1200 }
        }
      }
    ],
    "totalCount": { "added": 1, "removed": 1, "changed": 1 }
  }
}
```

Use this endpoint when the user starts a new session, asks "what's new", or wants to know what changed since their last sync.
