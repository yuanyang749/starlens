# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- Run Web app: `corepack pnpm dev` (Uses `.env`)
- Run Mobile app: `corepack pnpm dev:mobile` (Uses `.env`)
- Run MCP Stdio server: `corepack pnpm mcp:start` (Requires `STARLENS_TOKEN` and `STARLENS_API_BASE_URL`)
- Login with CLI: `printf '%s\n' '<your-token>' | corepack pnpm --filter @starlens/cli start -- login --token-stdin`
- CLI status: `corepack pnpm --filter @starlens/cli start -- status`

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

### Linting
- Lint Web app: `corepack pnpm lint`
- Lint Mobile app: `corepack pnpm lint:mobile`

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
