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
