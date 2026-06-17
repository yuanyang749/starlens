---
name: starlens
description: Use when an agent runtime such as Hermes, OpenClaw, custom HTTP agents, or coding assistants needs to search, inspect, organize, tag, sync, or ask questions over a user's GitHub starred repositories stored in StarLens. Prefer this skill for agent-side StarLens integration through HTTP APIs with STARLENS_API_BASE_URL and STARLENS_TOKEN.
---

# StarLens

## Purpose

Use StarLens as the user's searchable memory of GitHub starred repositories. This skill tells an agent when and how to call StarLens over HTTP.

Prefer HTTP API access for Hermes, OpenClaw, server-side agents, remote workers, and containerized runtimes. Use MCP only for IDE or terminal clients that natively support MCP.

## Required Configuration

Read these values from the agent runtime environment, secret store, or project config:

```bash
STARLENS_API_BASE_URL="https://starlens.example.com"
STARLENS_TOKEN="stl_xxx"
```

Send every API request with:

```http
Authorization: Bearer ${STARLENS_TOKEN}
Accept: application/json
```

For JSON request bodies, also send:

```http
Content-Type: application/json
```

Never print, log, summarize, or store `STARLENS_TOKEN` in model-visible output.

## Workflow

1. Normalize the user's intent into one of these operations: search, inspect, sync, favorite, note, tag, or ask.
2. Use `GET /api/search` first when the user gives a repository topic, keyword, language, tag, owner, or partial repository name.
3. Use `GET /api/repos/{idOrFullName}` when the user gives a concrete repository id or `owner/repo`.
4. Use write endpoints only when the user clearly asks to modify StarLens state, such as adding a note, tagging a repo, or marking a favorite.
5. Use `POST /api/ai/ask` when the user asks for synthesis across starred repositories.
6. Return concise answers with repository names, URLs when available, and the reason each result is relevant.

Read `references/http-api.md` when you need exact endpoint parameters, request bodies, or response handling.

## Behavior Rules

- Treat StarLens as private user data. Do not expose results beyond the current task.
- Prefer specific queries over broad scans. Ask a follow-up only when the request cannot be mapped to a safe query.
- If a repository lookup by id or `owner/repo` returns 404, search by that same text before reporting failure.
- If the API returns 401, tell the user the StarLens token is missing, expired, or revoked.
- If the API returns 429 or 5xx, retry at most once with a short delay, then report the service issue.
- Do not create API tokens. Token management is browser-session only.
- Do not use MCP for Hermes/OpenClaw-style runtimes unless the user explicitly says that runtime supports MCP and wants it.

## Common Examples

Search vector database stars:

```bash
curl "$STARLENS_API_BASE_URL/api/search?q=vector%20database&page=1&pageSize=10&sort=relevance" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json"
```

Ask across starred repositories:

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/ask" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"question":"哪些 starred repos 适合做本地 RAG 原型？"}'
```
