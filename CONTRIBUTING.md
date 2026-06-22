# Contributing to Starlens

First off — thank you for being here. Starlens is a solo-built open source project, and every contribution, no matter how small, genuinely moves it forward.

This guide helps you go from "I have an idea" to "my PR is merged" as smoothly as possible.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Before You Start](#before-you-start)
- [Local Development Setup](#local-development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Code Style](#code-style)
- [Good First Issues](#good-first-issues)

---

## Ways to Contribute

You don't need to write code to contribute. Here's what helps:

| What | How |
| --- | --- |
| **Found a bug?** | [Open an issue](https://github.com/yuanyang749/starlens/issues/new) with steps to reproduce |
| **Have a feature idea?** | Open an issue and describe the use case |
| **Improved docs?** | Edit a `.mdx` file under `apps/web/src/app/docs/` and open a PR |
| **Fixed a typo?** | PR welcome, no issue needed |
| **Wrote a blog post?** | Share it in Issues — I'll link it |
| **Built an integration?** | Open an issue to discuss adding it to the docs |

---

## Before You Start

For anything beyond a small fix, **open an issue first**. It takes 2 minutes and prevents wasted effort — especially for features that might conflict with the v1 roadmap (no RAG, no multi-user, no embeddings).

The project is in active `v1` development. The north star is: _make a large GitHub Stars collection useful again, without over-engineering it._

If your idea fits that, it has a great chance of landing.

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) via Corepack (`corepack enable`)
- PostgreSQL (local instance or Docker)
- A GitHub OAuth App ([create one here](https://github.com/settings/developers))

### Step 1 — Clone and install

```bash
git clone https://github.com/yuanyang749/starlens.git
cd starlens
corepack pnpm install
```

### Step 2 — Configure environment

```bash
cp .env.example .env
```

Fill in the required values:

```bash
AUTH_SECRET="any-random-string"
NEXTAUTH_URL="http://localhost:3000"
AUTH_GITHUB_ID="your-oauth-app-client-id"
AUTH_GITHUB_SECRET="your-oauth-app-client-secret"
DATABASE_URL="postgres://starlens:starlens@localhost:54329/starlens_dev"
TOKEN_ENCRYPTION_SECRET="any-random-32-char-string"
```

For the GitHub OAuth App, set the callback URL to:

```
http://localhost:3000/api/auth/callback/github
```

### Step 3 — Run migrations and start

```bash
corepack pnpm db:migrate:local
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, and trigger a Stars sync from the workbench.

---

## Project Structure

```
apps/
  web/       Next.js Web app — workbench, landing page, docs, API shims
  mobile/    Next.js mobile workbench
  cli/       CLI tool (@starlens-app/cli)
  mcp/       Local stdio MCP server

packages/
  core/          Shared types, constants, and text utilities
  server/        Auth, DB, sync, AI, route controllers
  workbench/     Shared mobile workbench state hook
  agent-tools/   Tool schemas and HTTP API client for CLI/MCP/agent
```

**Key principle:** business logic lives in `packages/server`. The `apps/web/src/app/api/*` routes are thin wrappers that re-export from `packages/server/src/routes/*`. Keep it that way.

---

## Making Changes

### Build packages first

If you change anything in `packages/`, rebuild them before running the web app:

```bash
corepack pnpm build:packages
```

### Running tests

```bash
# Web app tests
corepack pnpm test

# Individual package tests
corepack pnpm --filter @starlens/workbench test
corepack pnpm --filter @starlens-app/cli test
corepack pnpm --filter @starlens-app/agent-tools test

# Single test file
cd apps/web && npx vitest run src/test/<filename>
```

### Linting

```bash
corepack pnpm lint
```

### Database changes

If your change requires a schema update:

```bash
# After editing packages/server/src/db/schema.ts
corepack pnpm db:generate
corepack pnpm db:migrate:local
```

Always commit generated migration files alongside your schema changes.

---

## Submitting a Pull Request

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Run tests and lint** before pushing:
   ```bash
   corepack pnpm test && corepack pnpm lint
   ```

4. **Open a PR** against `main`. In the description, include:
   - What the change does
   - Why it's needed (link the issue if there is one)
   - How to test it manually

5. **Small PRs merge faster.** If your change is large, consider splitting it.

That's it. No CLA, no contributor agreement, no bureaucracy.

---

## Code Style

The codebase has a few conventions worth knowing:

- **TypeScript everywhere.** No `any`, no untyped function returns in shared packages.
- **Server-only logic in `packages/server`.** Use the `"server-only"` import guard at the top of DB and auth files.
- **Comments in Chinese** for business logic in `packages/server` and route files — this is intentional, not a mistake. English is fine for everything else.
- **No mocks for DB tests.** Integration tests hit real DB state where possible.
- **KISS.** If a simpler version solves 90% of the problem, ship that first.

There's no Prettier config — the project uses the defaults from the Next.js ESLint setup. Don't reformat files wholesale; keep diffs focused.

---

## Good First Issues

Look for issues tagged [`good first issue`](https://github.com/yuanyang749/starlens/issues?q=label%3A%22good+first+issue%22) — these are intentionally scoped, well-specified, and don't require deep knowledge of the full codebase.

If none are listed yet, these areas are always friendly to new contributors:

- **Documentation fixes** — anything under `apps/web/src/app/docs/`
- **UI copy improvements** — Chinese copy in workbench components
- **Test coverage** — adding cases to existing test files in `apps/web/src/test/`
- **CLI UX** — small improvements to output formatting in `apps/cli/src/index.mjs`

---

## Questions?

Open an [issue](https://github.com/yuanyang749/starlens/issues) and tag it `question`. There are no stupid questions — if something in the codebase is confusing, that's a documentation bug worth fixing.

---

_Thanks again for taking the time to read this. Every PR, issue, and comment makes Starlens better for everyone using it._
