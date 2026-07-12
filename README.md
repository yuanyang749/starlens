# Starlens

[English](README.md) | [中文](README.zh-CN.md)

Starlens is a personal knowledge workbench for GitHub Stars. It syncs starred repositories into PostgreSQL, enriches them with lightweight summaries, and gives users a searchable workspace for tags, notes, favorites, AI-assisted recall, CLI access, and local agent integration.

The project is currently in active `v1` development. The main goal is to make a large GitHub Stars collection useful again without turning it into a heavyweight RAG or team collaboration platform.

## What It Does

- Syncs GitHub starred repositories through GitHub OAuth.
- Stores repository metadata, topics, language, star counts, timestamps, README excerpts, user tags, notes, and favorite state.
- Provides a desktop workbench at `/app` and a mobile workbench at `/mobile`.
- Supports keyword search, filters, sorting, repository detail inspection, tag editing, note editing, and favorite management.
- Supports advanced search filters: star count range, starred date range, last push date, note content, and note presence.
- Supports tool-calling AI queries that can search, inspect, aggregate, recommend, organize, and update a user's repository knowledge base.
- Exposes personal API tokens for CLI, MCP, and agent workflows.
- One-command setup: Agent Skill (via `npx skills add`) + MCP Server config via `stars setup`, or MCP-only via `stars install-mcp`.
- Includes static product documentation under `/docs`.

## Current Scope

Implemented or actively wired:

- Public landing page, documentation, changelog, privacy, and terms routes.
- Authenticated Web workbench.
- Mobile workbench shell and shared mobile workbench state.
- Shared API route implementation through `packages/server`.
- GitHub Stars sync and repository search with advanced filters.
- AI provider configuration and validation, one-shot Agent ask, and persistent SSE multi-turn chat.
- CLI (`@starlens-app/cli`) published to npm: `stars` commands for login, status, sync, search, show, open, ask, favorite, notes, tags, `setup`, and `install-mcp`.
- MCP stdio server for IDE and local agent clients.
- HTTP MCP endpoint for hosted clients (Claude Code, Cursor).
- Agent Skill one-click install for Claude Code, Cursor, Codex, opencode, OpenClaw, Hermes, and VS Code.

Explicitly out of scope for `v1`:

- Full README corpus storage.
- Vector search, embeddings, and full RAG.
- Multi-provider automatic fallback.
- Multi-user collaboration.
- A generic arbitrary-provider request adapter.

## Architecture

Starlens is a `pnpm` workspace:

```text
apps/
  web/       Next.js Web app, desktop workbench, landing page, docs, API shims
  mobile/    Next.js mobile workbench app
  cli/       Local CLI for token-based access (@starlens-app/cli)
  mcp/       Local stdio MCP server

packages/
  core/        Shared DTOs, types, mock data, and repo text utilities
  server/      Auth, DB, GitHub sync, search, AI config, token, and route logic
  workbench/   Shared mobile workbench state and formatting utilities
  agent-tools/ MCP/agent tool definitions and HTTP API client logic

docs/          Product, architecture, schema, environment, and integration notes
drizzle/       Database migrations and snapshots
scripts/       Environment and database helper scripts
```

The Web and Mobile apps expose thin route handlers. Most backend behavior lives in `packages/server`, so CLI, MCP, Web, and Mobile all depend on the same API contract instead of duplicating business logic.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- PostgreSQL
- Drizzle ORM
- NextAuth GitHub OAuth
- Vitest
- MCP SDK
- pnpm workspaces

## Requirements

- Node.js `>=20.11.0`
- pnpm `10.33.3` through Corepack
- PostgreSQL for local development or Neon for hosted environments
- A GitHub OAuth application

Enable pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.33.3 --activate
```

## Local Setup

Install dependencies:

```bash
corepack pnpm install
```

Create local environment variables:

```bash
cp .env.example .env
```

Fill the required values:

```bash
AUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
DATABASE_URL=postgres://starlens:starlens@localhost:54329/starlens_dev
TOKEN_ENCRYPTION_SECRET=
SYSTEM_AI_API_KEY=
SYSTEM_AI_BASE_URL=
SYSTEM_AI_MODEL=
SYSTEM_AI_PROVIDER_TYPE=openai_compatible
SYSTEM_AI_ENABLED=true
SYSTEM_AI_FALLBACK_MODEL=
SYSTEM_AI_EXTRA_HEADERS=
```

Run database migrations:

```bash
corepack pnpm db:migrate:local
```

Start the Web app:

```bash
corepack pnpm dev
```

Start the Mobile app separately:

```bash
corepack pnpm dev:mobile
```

## Environment Variables

| Variable                  | Required | Purpose                                                              |
| ------------------------- | -------- | -------------------------------------------------------------------- |
| `DATABASE_URL`            | Yes      | PostgreSQL connection string.                                        |
| `AUTH_SECRET`             | Yes      | NextAuth session secret.                                             |
| `NEXTAUTH_URL`            | Yes      | Public app URL, for example `http://localhost:3000`.                 |
| `AUTH_GITHUB_ID`          | Yes      | GitHub OAuth client ID.                                              |
| `AUTH_GITHUB_SECRET`      | Yes      | GitHub OAuth client secret.                                          |
| `TOKEN_ENCRYPTION_SECRET` | Yes      | Secret used to encrypt provider keys and personal tokens.            |
| `SYSTEM_AI_API_KEY`       | Optional | System-level AI key used only when the user has no default provider. |
| `SYSTEM_AI_BASE_URL`      | Optional | System-level OpenAI-compatible fallback base URL.                    |
| `SYSTEM_AI_MODEL`         | Optional | System-level fallback model name.                                    |
| `SYSTEM_AI_PROVIDER_TYPE` | Optional | System-level provider type, defaults to `openai_compatible`.         |
| `SYSTEM_AI_ENABLED`       | Optional | Set to `false` to disable the system-level fallback.                 |
| `SYSTEM_AI_FALLBACK_MODEL` | Optional | Retry model on the same gateway and API key after a primary failure. |
| `SYSTEM_AI_EXTRA_HEADERS` | Optional | JSON object string containing extra headers required by a gateway.   |

Legacy `OPENAI_*` keys are still read for migration compatibility, but new deployments should use `SYSTEM_AI_*`.

For hosted Neon validation, copy `.env.neon.example` to `.env.neon` and use the Neon pooled connection string with `sslmode=require`.

## Development Commands

| Command                          | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `corepack pnpm dev`              | Start the Web app with `.env`.                                   |
| `corepack pnpm dev:mobile`       | Start the Mobile app with `.env`.                                |
| `corepack pnpm build`            | Build the Web app.                                               |
| `corepack pnpm build:mobile`     | Build the Mobile app.                                            |
| `corepack pnpm build:packages`   | Build internal packages (run this first if you see type errors). |
| `corepack pnpm lint`             | Run Web lint checks.                                             |
| `corepack pnpm lint:mobile`      | Run Mobile lint checks.                                          |
| `corepack pnpm test`             | Run Web tests.                                                   |
| `corepack pnpm test:mobile`      | Run Mobile tests.                                                |
| `corepack pnpm db:migrate:local` | Apply migrations to local PostgreSQL.                            |
| `corepack pnpm db:check:local`   | Check the local database connection.                             |
| `corepack pnpm mcp:start`        | Start the local Starlens MCP server.                             |
| `corepack pnpm check:docs`       | Validate current documentation links and retired terminology.   |

Package-level tests:

```bash
corepack pnpm --filter @starlens-app/cli test
corepack pnpm --filter @starlens-app/agent-tools test
corepack pnpm --filter @starlens/workbench test
```

## CLI Usage

The CLI is available as a standalone npm package:

```bash
npm install -g @starlens-app/cli@latest
```

Create a personal token in the Web app, then log in:

```bash
printf '%s\n' 'stl_xxx' | stars login --token-stdin
```

Common commands:

```bash
stars status
stars sync
stars search "agent framework"
stars show owner/repo
stars ask "which repos are good for local agent workflows?"
stars ask "how many TypeScript projects do I have?"
stars favorite owner/repo
stars note owner/repo --set "Review for MCP integration"
stars tag add owner/repo agent
```

One-command setup — installs the Agent Skill (via `npx skills add`) and configures MCP Server:

```bash
stars setup
```

Or configure MCP Server only (skip Skill installation):

```bash
stars install-mcp
```

The `setup` wizard runs `npx skills add https://github.com/yuanyang749/starlens` to install the Skill across detected AI clients, then walks you through MCP Server configuration (deployment mode, API token, client config writes).

If you prefer to run directly from the monorepo during development:

```bash
corepack pnpm --filter @starlens-app/cli start -- <command>
```

## MCP / Agent Integration

### Hosted HTTP MCP (recommended for most clients)

If you use the hosted service at `https://starlens.520ai.xin`, connect via HTTP MCP — no local process needed:

**Claude Code:**

```bash
claude mcp add-json starlens '{
  "type": "http",
  "url": "https://starlens.520ai.xin/mcp",
  "headers": { "Authorization": "Bearer stl_xxx" }
}'
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "starlens": {
      "url": "https://starlens.520ai.xin/mcp",
      "headers": { "Authorization": "Bearer stl_xxx" }
    }
  }
}
```

**opencode** (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "starlens": {
      "type": "remote",
      "url": "https://starlens.520ai.xin/mcp",
      "headers": { "Authorization": "Bearer stl_xxx" },
      "enabled": true
    }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.starlens]
url = "https://starlens.520ai.xin/mcp"
http_headers = {Authorization = "Bearer stl_xxx"}
startup_timeout_sec = 30
default_tools_approval_mode = "approve"
```

### Self-hosted stdio MCP

Start the local MCP server against your own Starlens instance:

```bash
STARLENS_TOKEN="stl_xxx" \
STARLENS_API_BASE_URL="http://localhost:3000" \
corepack pnpm mcp:start
```

Cursor-style stdio config:

```json
{
  "mcpServers": {
    "starlens": {
      "command": "corepack",
      "args": ["pnpm", "mcp:start"],
      "cwd": "/path/to/starlens",
      "env": {
        "STARLENS_TOKEN": "stl_xxx",
        "STARLENS_API_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Available MCP Tools

| Tool                   | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `search_stars`         | Search and filter starred repositories                                                  |
| `show_star`            | View a single repository's detail                                                       |
| `sync_stars`           | Trigger a GitHub Stars sync                                                             |
| `favorite_star`        | Mark a repository as favorite (local flag only — does not change your real GitHub star) |
| `unfavorite_star`      | Remove favorite state (local flag only — does not change your real GitHub star)         |
| `star_repo`            | Actually star a repository on GitHub (any owner/repo, even one you've never starred)    |
| `unstar_repo`          | Actually remove your GitHub star from a repository                                      |
| `set_star_note`        | Set or clear a repository note                                                          |
| `add_star_tag`         | Add a tag to a repository                                                               |
| `remove_star_tag`      | Remove a tag from a repository                                                          |
| `ask_stars`            | Natural language AI query over your Stars                                               |
| `analyze_repo`         | Analyze a repo and suggest tags/notes (starred or not)                                  |
| `recommend_for_task`   | Recommend starred repos relevant to a coding task                                       |
| `find_related`         | Find starred repos related to a given repo                                              |
| `suggest_organization` | Suggest duplicates/stale/untagged repos to clean up                                     |
| `get_sync_summary`     | Summarize what changed since the last sync                                              |

Do not commit real API tokens or MCP client configs containing secrets.

## Documentation

User-facing docs are published with the Web app:

- [Features](https://starlens.520ai.xin/docs/features) — search, filters, AI Agent queries, tags, notes
- [Architecture](https://starlens.520ai.xin/docs/architecture) — module layout and data flow
- [Integrations](https://starlens.520ai.xin/docs/integrations) — GitHub OAuth, API Token, AI Provider, CLI, MCP
- [Deployment](https://starlens.520ai.xin/docs/deployment) — Docker self-hosting, Node.js, local dev

Engineering references:

- [Documentation map and source-of-truth policy](docs/README.md)
- [Environment guide](docs/environments.md)
- [API contract](docs/api-contract.md)
- [Database schema](docs/database-schema.md)
- [Agent integration](docs/agent-integration.md)
- [Historical project plan](docs/archive/project-plan.md)

Runtime code and database migrations remain authoritative. The documentation map
explains which files describe current behavior and which files are historical
design records.

## Deployment Notes

The primary deployment path is Docker self-hosting with PostgreSQL. See the [deployment docs](https://starlens.520ai.xin/docs/deployment) for the full guide.

Quick reference for Docker:

```bash
# Run migrations
docker compose -f deploy/docker-compose.yml --profile migrate run --rm starlens-migrate

# Build and start
docker compose -f deploy/docker-compose.yml up -d --build starlens-web
```

Before deploying:

```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm check:docs
```

## Security Notes

- Personal API tokens are only shown once at creation time.
- Stored token and provider secrets are encrypted or hashed server-side.
- The local MCP mode uses stdio and does not open a network port; hosted HTTP MCP is served by the existing Web deployment.
- `v1` uses user-level token ownership as the authorization boundary; fine-grained token scopes are not part of the current scope.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, PR guidelines, code style, and good first issues.

## Project Status

Core functionality is stable and running in production. Active development focus:

- Expanding AI ask coverage and accuracy.
- Scheduled automatic sync.
- Mobile workbench polish and real-device testing.
- Improving deployment documentation and self-hosting experience.
