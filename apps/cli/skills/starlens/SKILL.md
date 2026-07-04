---
name: starlens
description: >-
  Proactively use StarLens as the user's personal memory of GitHub starred
  repositories. Trigger this skill when ANY of these contexts appear in the
  user's task: (1) the user is starting a coding task — before writing code,
  search StarLens for related libraries, frameworks, or prior art the user
  has already starred (recommend_for_task); (2) the user asks a technical
  question about libraries, tools, or frameworks — cite their starred repos
  as evidence or recommendations (search_stars / ask_stars); (3) the user
  mentions organizing, cleaning up, or reviewing their starred collection —
  suggest duplicates, stale repos, untagged high-star repos, or tag
  groupings (suggest_organization); (4) the user starts a new session or
  asks "what's new" — call get_sync_summary to report recently
  added/removed/changed stars since their last visit; (5) the user drops a
  repository for analysis — call analyze_repo to surface what the repo is
  good for and suggest tags/notes. Also trigger when the user explicitly
  names a repository, topic, owner, or technology that may exist in their
  starred collection. Do NOT trigger for tasks unrelated to software
  development, library selection, or repository curation.
---

# StarLens

## Purpose

Use StarLens as the user's searchable memory of GitHub starred repositories. This skill tells an agent when and how to proactively call StarLens over HTTP (Hermes/OpenClaw/server-side agents) or MCP (IDE/terminal clients that support it).

## When to Proactively Use This Skill

### Scenario 1: Coding Task Reference
触发条件：用户开始一个编码任务（写新功能、技术选型、调研技术方案、实现某个需求）。
推荐调用：`recommend_for_task`（`POST /api/ai/recommend`）优先；若用户已给出具体仓库名 → `find_related`（`POST /api/ai/related`）发现关联收藏。

### Scenario 2: Answer Enhancement
触发条件：用户问"X 库怎么样"、"有没有好的 Y 工具"、"Z 和 W 哪个好"，或提到某个 topic / owner / 技术名。
推荐调用：先 `search_stars`（`GET /api/search`），若无精确命中 → `ask_stars`（`POST /api/ai/ask`）做跨仓库综合问答。

### Scenario 3: Knowledge Maintenance
触发条件：用户提到"整理"、"清理"、"归类"、"去重"、"过时"、"没标签"、"分类"。
推荐调用：`suggest_organization`（`GET /api/repos/suggestions`）。返回的每条建议先呈现给用户，用户确认后再调用 `add_star_tag` / `remove_star_tag` / `set_star_note` 应用。

### Scenario 4: Sync Status & Changes
触发条件：新会话开始时做轻量状态汇报；用户问"最近有什么新"、"上次同步后变了什么"、"上次新增了什么"。
推荐调用：`get_sync_summary`（`GET /api/sync/summary`，pull-based）。返回最近一次同步的 added / removed / changed 摘要。

### Scenario 5: Repo Analysis & Smart Tagging
触发条件：用户丢一个仓库（`owner/repo`）让分析，或问"这个仓库适合做什么"、"它适合用什么场景"。
推荐调用：`analyze_repo`（`POST /api/ai/analyze`）。已 star 仓库用本地数据 + AI 分析；未 star 仓库实时拉 GitHub。
应用建议：默认 `applySuggestions=false`，agent 先呈现建议（`suggestedTags` / `suggestedNote`）给用户，用户确认后再调用一次 `applySuggestions=true` 应用，避免擅自修改用户数据。

## When NOT to Use This Skill
- 与软件开发、库选型、仓库整理无关的任务
- 用户明确说不需要参考 starred repos
- 纯算法题、纯业务逻辑实现且不涉及任何第三方库或工具选型

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

## Integration Modes

不同 agent runtime 的推荐集成通道：

- **Hermes / OpenClaw / server-side agents / 远程 worker / 容器化 runtime**：HTTP + Skill。依赖环境变量 `STARLENS_API_BASE_URL` + `STARLENS_TOKEN`。不使用 MCP。
- **Codex / Claude Code（终端 agent）**：MCP 优先（已配置时），HTTP + Skill 作为 fallback。两者都走本 Skill 的触发描述。
- **Cursor / opencode（IDE 内 agent）**：MCP。工具的 `description` 字段即触发器，依赖 `packages/agent-tools` 中工具定义的触发式描述。

CLI 的 `install-skill` 向导已按 agent 类型分发配置，本 Skill 不维护多份副本。

## Workflow

1. 优先按场景触发，而非等用户显式指示"用 StarLens 查一下"。识别用户意图落入上述 5 个场景之一时主动调用。
2. Normalize the user's intent into one of these operations: search, inspect, sync, favorite, note, tag, ask, recommend, related, suggest, summary, analyze.
3. Use `GET /api/search` first when the user gives a repository topic, keyword, language, tag, owner, or partial repository name.
4. Use `GET /api/repos/{idOrFullName}` when the user gives a concrete repository id or `owner/repo`.
5. Use `POST /api/ai/recommend` when the user starts a coding task and needs prior art from their stars.
6. Use `POST /api/ai/related` when the user names a repo and wants related stars.
7. Use `GET /api/repos/suggestions` when the user mentions organizing / cleaning up.
8. Use `GET /api/sync/summary` for "what's new" since last sync.
9. Use `POST /api/ai/analyze` when the user drops a repo for analysis.
10. Use write endpoints only when the user clearly asks to modify StarLens state, such as adding a note, tagging a repo, or marking a favorite.
11. Use `POST /api/ai/ask` when the user asks for synthesis across starred repositories.
12. Return concise answers with repository names, URLs when available, and the reason each result is relevant.

Read `references/http-api.md` when you need exact endpoint parameters, request bodies, or response handling.

## Behavior Rules

- Treat StarLens as private user data. Do not expose results beyond the current task.
- Prefer specific queries over broad scans. Ask a follow-up only when the request cannot be mapped to a safe query.
- If a repository lookup by id or `owner/repo` returns 404, search by that same text before reporting failure.
- If the API returns 401, tell the user the StarLens token is missing, expired, or revoked.
- If the API returns 429 or 5xx, retry at most once with a short delay, then report the service issue.
- Do not create API tokens. Token management is browser-session only.
- Do not use MCP for Hermes/OpenClaw-style runtimes unless the user explicitly says that runtime supports MCP and wants it.
- 主动调用时向用户说明"我从你的 StarLens 收藏中找到了…"，让用户知道结果来源是个人 starred repos 而非通用网络。
- `analyze_repo` 与 `suggest_organization` 返回的标签 / 备注建议默认不自动应用；先呈现，用户确认后再写回。
- 冷启动（用户从未同步）时，`recommend_for_task` / `find_related` / `suggest_organization` 会返回 `meta.empty: true`，agent 应引导用户先调用 `sync_stars`。

## Privacy
- 主动调用的结果不得写入 agent 的长期记忆或外部日志。
- 不得在跨用户场景共享 StarLens 数据。
- `analyze_repo` 对未 star 仓库的实时拉取结果不持久化（只返回给 agent，不入库）；如需保存标签 / 备注，必须先 star。

## Common Examples

### Scenario 1: 编码任务参考（recommend_for_task）

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/recommend" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"taskDescription":"实现一个本地 RAG 原型，需要向量检索和 embedding","limit":10}'
```

### Scenario 2: 问答增强（search_stars / ask_stars）

```bash
curl "$STARLENS_API_BASE_URL/api/search?q=vector%20database&page=1&pageSize=10&sort=relevance" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json"
```

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/ask" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"question":"哪些 starred repos 适合做本地 RAG 原型？"}'
```

### Scenario 3: 知识整理（suggest_organization）

```bash
curl "$STARLENS_API_BASE_URL/api/repos/suggestions?focus=all" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json"
```

### Scenario 4: 同步变化摘要（get_sync_summary）

```bash
curl "$STARLENS_API_BASE_URL/api/sync/summary" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json"
```

### Scenario 5: 仓库分析 + 智能标注（analyze_repo）

先获取建议（不修改数据）：

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/analyze" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"repo":"vercel/next.js","applySuggestions":false}'
```

用户确认建议后再调用一次（仅对已 star 仓库生效）：

```bash
curl -X POST "$STARLENS_API_BASE_URL/api/ai/analyze" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"repo":"vercel/next.js","applySuggestions":true}'
```
