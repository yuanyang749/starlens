# Starlens

Starlens is a personal knowledge workbench for GitHub Stars. It syncs starred repositories into PostgreSQL, enriches them with lightweight summaries, and gives users a searchable workspace for tags, notes, favorites, AI-assisted recall, CLI access, and local agent integration.

The project is currently in active `v1` development. The main goal is to make a large GitHub Stars collection useful again without turning it into a heavyweight RAG or team collaboration platform.

## What It Does

- Syncs GitHub starred repositories through GitHub OAuth.
- Stores repository metadata, topics, language, star counts, timestamps, README excerpts, user tags, notes, and favorite state.
- Provides a desktop workbench at `/app` and a mobile workbench at `/mobile`.
- Supports keyword search, filters, sorting, repository detail inspection, tag editing, note editing, and favorite management.
- Supports AI-assisted repository recall through OpenAI-compatible provider settings or environment-based fallback.
- Exposes personal API tokens for CLI, MCP, and agent workflows.
- Includes static product documentation under `/docs`.

## Current Scope

Implemented or actively wired:

- Public landing page and documentation routes.
- Authenticated Web workbench.
- Mobile workbench shell and shared mobile workbench state.
- Shared API route implementation through `packages/server`.
- GitHub Stars sync and repository search.
- AI provider configuration, validation, and AI ask route integration.
- CLI commands for login, status, sync, search, show, open, ask, favorite, notes, and tags.
- MCP stdio server for IDE and local agent clients.

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
  cli/       Local CLI for token-based access
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
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL_KEY=
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

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `AUTH_SECRET` | Yes | NextAuth session secret. |
| `NEXTAUTH_URL` | Yes | Public app URL, for example `http://localhost:3000`. |
| `AUTH_GITHUB_ID` | Yes | GitHub OAuth client ID. |
| `AUTH_GITHUB_SECRET` | Yes | GitHub OAuth client secret. |
| `TOKEN_ENCRYPTION_SECRET` | Yes | Secret used to encrypt provider keys and personal tokens. |
| `OPENAI_API_KEY` | Optional | Environment fallback for AI ask. |
| `OPENAI_BASE_URL` | Optional | OpenAI-compatible fallback base URL. |
| `OPENAI_MODEL_KEY` | Optional | Fallback model name. |

For hosted Neon validation, copy `.env.neon.example` to `.env.neon` and use the Neon pooled connection string with `sslmode=require`.

## Development Commands

| Command | Description |
| --- | --- |
| `corepack pnpm dev` | Start the Web app with `.env`. |
| `corepack pnpm dev:mobile` | Start the Mobile app with `.env`. |
| `corepack pnpm build` | Build the Web app. |
| `corepack pnpm build:mobile` | Build the Mobile app. |
| `corepack pnpm lint` | Run Web lint checks. |
| `corepack pnpm lint:mobile` | Run Mobile lint checks. |
| `corepack pnpm test` | Run Web tests. |
| `corepack pnpm test:mobile` | Run Mobile tests. |
| `corepack pnpm db:migrate:local` | Apply migrations to local PostgreSQL. |
| `corepack pnpm db:check:local` | Check the local database connection. |
| `corepack pnpm mcp:start` | Start the local Starlens MCP server. |

Package-level tests:

```bash
corepack pnpm --filter @starlens/cli test
corepack pnpm --filter @starlens/agent-tools test
corepack pnpm --filter @starlens/workbench test
```

## CLI Usage

Create a personal token in the Web app, then log in:

```bash
printf '%s\n' 'stl_xxx' | corepack pnpm --filter @starlens/cli start -- login --token-stdin
```

Common commands:

```bash
corepack pnpm --filter @starlens/cli start -- status
corepack pnpm --filter @starlens/cli start -- sync
corepack pnpm --filter @starlens/cli start -- search "agent framework"
corepack pnpm --filter @starlens/cli start -- show owner/repo
corepack pnpm --filter @starlens/cli start -- ask "哪些仓库适合做本地 agent 工具？"
corepack pnpm --filter @starlens/cli start -- favorite owner/repo
corepack pnpm --filter @starlens/cli start -- note owner/repo --set "Review for MCP integration"
corepack pnpm --filter @starlens/cli start -- tag add owner/repo agent
```

## MCP / Agent Integration

Start the local MCP server:

```bash
STARLENS_TOKEN="stl_xxx" \
STARLENS_API_BASE_URL="http://localhost:3000" \
corepack pnpm mcp:start
```

Cursor-style MCP config:

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

Available MCP tools include:

- `search_stars`
- `show_star`
- `sync_stars`
- `favorite_star`
- `unfavorite_star`
- `set_star_note`
- `add_star_tag`
- `remove_star_tag`
- `ask_stars`

Do not commit real API tokens or MCP client configs containing secrets.

## Documentation

- [Project plan](docs/project-plan.md)
- [Environment guide](docs/environments.md)
- [API contract](docs/api-contract.md)
- [Database schema](docs/database-schema.md)
- [Sync flow design](docs/sync-flow-design.md)
- [Agent integration](docs/agent-integration.md)
- [Frontend implementation plan](docs/frontend-implementation-plan.md)

The running Web app also exposes user-facing docs under `/docs`.

## Deployment Notes

The intended default deployment path is Vercel plus PostgreSQL, with Neon Free as the recommended starting database option.

Before deploying:

```bash
corepack pnpm db:migrate:neon
corepack pnpm db:check:neon
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

Deployment environment variables should match `.env.neon.example` and use the production `NEXTAUTH_URL`.

## Security Notes

- Personal API tokens are only shown once at creation time.
- Stored token and provider secrets are encrypted or hashed server-side.
- MCP runs as a local stdio process and does not open a public network port.
- `v1` uses user-level token ownership as the authorization boundary; fine-grained token scopes are not part of the current scope.

## Project Status

Starlens is not a finished product yet. The highest-value remaining work is tightening production verification, completing scheduled sync, improving deployment documentation, and expanding real-device mobile validation.

