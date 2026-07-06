# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

- Run Web app: `corepack pnpm dev` (Uses `.env`)
- Run Mobile app: `corepack pnpm dev:mobile` (Uses `.env`)
- Run MCP Stdio server: `corepack pnpm mcp:start` (Requires `STARLENS_TOKEN` and `STARLENS_API_BASE_URL`)
- Login with CLI: `printf '%s\n' '<your-token>' | corepack pnpm --filter @starlens-app/cli start -- login --token-stdin`
- CLI status: `corepack pnpm --filter @starlens-app/cli start -- status`

### Environment Files

- `.env`, `.env.example`, and `.env.neon.example` live at the repo root and are gitignored.
- Local dev: copy `.env.example` → `.env`. Hosted Neon validation: copy `.env.neon.example` → `.env.neon` (use the pooled connection string with `sslmode=require`).
- The `dev`, `build`, and `db:*` scripts inject `.env` via `scripts/with-env.mjs`; the `db:*neon` variants use `.env.neon`. Do not commit real secrets.

### Build

- Build internal packages: `corepack pnpm build:packages` (Always build packages first if there are type/resolution errors)
- Build Web app: `corepack pnpm build`
- Build Mobile app: `corepack pnpm build:mobile`

### Tests

- Run Web tests: `corepack pnpm test`
- Run Mobile tests: `corepack pnpm test:mobile`
- Run Workbench package tests: `corepack pnpm --filter @starlens/workbench test`
- Run CLI package tests: `corepack pnpm --filter @starlens-app/cli test`
- Run Agent-tools package tests: `corepack pnpm --filter @starlens-app/agent-tools test`
- Run a single test file (inside web): `cd apps/web && npx vitest run src/test/<test-file-name>`

### Database

- Generate migrations: `corepack pnpm db:generate`
- Run local migrations: `corepack pnpm db:migrate:local` (Uses `.env`)
- Run Neon migrations: `corepack pnpm db:migrate:neon` (Uses `.env.neon`)
- Check local DB connection: `corepack pnpm db:check:local`
- Check Neon DB connection: `corepack pnpm db:check:neon`

### Database & Migrations (gotcha)

- The single source of truth is the **root** `drizzle.config.ts`. The `db:*` scripts run from `apps/web` with `--config ../../drizzle.config.ts`, so its `schema` path (`./src/db/schema.ts`) resolves relative to `apps/web`.
- The canonical schema lives in `packages/server/src/db/schema.ts` and is re-exported by `apps/web/src/db/schema.ts`. Generate migrations from the workspace root via `corepack pnpm db:generate` — never hand-edit migration SQL.
- Schema changes must be reflected in both `packages/server` (runtime) and the web re-export; if a new table is added, update the server schema and verify the web re-export still compiles.

### Linting

- Lint Web app: `corepack pnpm lint`
- Lint Mobile app: `corepack pnpm lint:mobile`

### API Shim Consistency

- Check Web vs Mobile API shim parity: `node scripts/check-api-shims.mjs` — reports routes that exist under `apps/web/src/app/api` but are missing an equivalent shim under `apps/mobile/src/app/api` (excluding routes explicitly listed as web-only in the script).

## High-Level Architecture

### Repository Layout

Starlens is structured as a monorepo workspace managed by `pnpm`.

- **`apps/`**: Applications
  - `web/`: Next.js Web app. Serves desktop workbench, landing page, settings views, and exposes Next.js API Routes (which proxy handlers from `packages/server/routes`).
  - `mobile/`: Next.js Mobile app. Relies on state management and formatted values from `packages/workbench`.
  - `cli/`: Local Node.js CLI tool (`stars`) for searching, syncing, tagging, and writing notes from a terminal.
  - `mcp/`: Local stdio Model Context Protocol (MCP) server for integration with IDEs (like Cursor, VS Code) and agents.
- **`packages/`**: Shared Workspace Packages
  - `core/`: Common schemas, types (e.g. `RepoSummary`, `AiConfig`), constants, mock data, and repository text utilities.
  - `server/`: Main backend layer containing Drizzle schemas and PostgreSQL database client, NextAuth configuration, GitHub OAuth and repository sync/unstar logic, AI provider wrapper interfaces, and API route controller logic.
  - `workbench/`: Shared workbench state logic hook (`useMobileWorkbench`) and formatting utils.
  - `agent-tools/`: Decoupled MCP tool schema definitions and API client logic (`callAgentTool`) shared by CLI, MCP, and Web app.

- **Top-level support directories** (not part of the app build graph):
  - `scripts/`: Workspace helper scripts.
    - `with-env.mjs`: Loads a `.env` file then runs the wrapped command (used by `dev`, `build`, `db:*` scripts).
    - `sync-skill.mjs`: Copies `agent-skills/starlens` into the published CLI package so `stars install-skill` can ship it. Runs automatically on `pnpm install` (postinstall). **Edit the skill in `agent-skills/starlens`, never a generated copy.**
    - `check-api-shims.mjs`: Web↔Mobile API route parity check (see below).
    - `deploy.mjs`: Deployment helper.
    - `bin/`: Small CLI shims.
  - `drizzle/`: Drizzle ORM migration files and snapshots.
  - `docs/`: User-facing product docs (features, architecture, integrations, deployment) plus internal design notes (`project-plan`, `environments`, `api-contract`, `database-schema`, `sync-flow-design`, `agent-integration`).
  - `deploy/`: Self-hosting assets — `docker-compose.yml`, `.env.production.example`, an OpenResty config template (`.example`), and a Let's Encrypt TLS script (`issue-letsencrypt.sh`).
  - `agent-skills/starlens`: Source of truth for the one-click installable Agent Skill (`SKILL.md`, `agents/openai.yaml`, `references/http-api.md`). Synced into the CLI by `scripts/sync-skill.mjs`.
  - `discuss/`: Design discussions and marketing drafts (e.g. workbench refactor plans, contest/WeChat write-ups). Context only.
  - `design-assets/`, `marketing-video/`: Static media assets; never compiled or bundled.

### Data Flow & Execution Pathways

1. **API Router Mapping**:
   Instead of duplicating endpoints, Next.js routes under `apps/web/src/app/api/*` dynamically re-export endpoint handlers from `packages/server/src/routes/*`.
2. **Curation & Sync Pipeline**:
   - `github_accounts` stores encrypted OAuth tokens.
   - Sync fetches GitHub stars, parses README excerpts (`packages/core/src/repo-text.ts`), calls configured AI models for summarized metadata enrichment, and saves them to `starred_repos`.
3. **Authentication Boundary**:
   - Web uses cookie-based authentication via NextAuth.
   - CLI/Agent endpoints use personal API tokens (Bearer Token). All checks route through `getApiUser` in `packages/server/src/server/auth/api-user.ts`.
4. **Agent Tools Adapter**:
   - The MCP stdio server (`apps/mcp`), the serverless MCP route (`apps/web/src/app/api/mcp`), and the CLI (`apps/cli`) all delegate tool execution to `callAgentTool` from `packages/agent-tools` over HTTP.
   - Tool schemas are defined once in `packages/agent-tools` and shared verbatim across the MCP stdio server, the HTTP MCP route, and the CLI — do not redefine tool argument shapes per-app.

### Code Conventions

- **Business logic lives in `packages/server`.** `apps/web/src/app/api/*` routes should stay thin: most either `export * from "@starlens/server/routes/<path>/route"` directly, or add app-specific concerns (e.g. the MCP transport in `apps/web/src/app/api/mcp/route.ts`) around a call into `packages/server`.
- **Comments in Chinese** are intentional for business logic in `packages/server` and route files; English is fine elsewhere. Don't "fix" this.
- **`"server-only"` import guard** at the top of DB and auth files in `packages/server` — preserve it when editing those files.
- **No mocks for DB tests** — integration tests hit real DB state where possible.
- **KISS over generality.** This project explicitly excludes vector search/embeddings/full RAG, multi-provider fallback, multi-user collaboration, and a generic arbitrary-provider adapter for `v1`. Don't introduce these unless asked.
