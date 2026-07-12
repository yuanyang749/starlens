# Starlens documentation map

This directory contains engineering references and historical design notes. It is
not a second copy of the user documentation.

## Source-of-truth order

When two documents disagree, use this order:

1. Runtime code and database migrations.
2. The current engineering references listed below.
3. User-facing MDX documentation under `apps/web/src/app/docs/`.
4. Historical plans and design notes.

The root `README.md` and `README.zh-CN.md` are product overviews. Keep detailed
setup, API, and schema behavior in the references below and link to them instead
of copying large sections into another document.

## Current engineering references

| Document | Responsibility | Code to verify against |
| --- | --- | --- |
| [Environment guide](environments.md) | Local, Neon, and production configuration | `.env.example`, `.env.neon.example`, `deploy/.env.production.example`, root `package.json` |
| [API contract](api-contract.md) | HTTP authentication, request/response shapes, and route inventory | `packages/server/src/routes/`, `skills/starlens/references/http-api.md` |
| [Database schema](database-schema.md) | Tables, fields, constraints, and indexes | `packages/server/src/db/schema.ts`, `apps/web/drizzle/` |
| [Agent integration](agent-integration.md) | Skill, HTTP API, CLI, and MCP integration paths | `skills/starlens/`, `apps/cli/src/install-mcp/`, `packages/agent-tools/` |

User-facing documentation is maintained under `apps/web/src/app/docs/` and is
published at `https://starlens.520ai.xin/docs`.

## Historical and planning documents

The following files explain past decisions or propose future work. They are not
contracts for the current implementation:

- `archive/project-plan.md`
- `architecture-optimization-plan.md`
- `information-architecture.md`
- `landing-page-design.md`
- `web-ui-design.md`
- `bklit-charts-integration-ideas.md`
- `superpowers/specs/`

Each historical document should carry a status note near its title. Do not copy
commands, routes, or paths from a historical document without checking the
current references and code.

## Maintenance checklist

When behavior changes:

1. Change code and tests.
2. Update the matching engineering reference.
3. Update user-facing MDX when users need to know about the change.
4. Update both root README files if the product overview or quick start changed.
5. Run `corepack pnpm check:docs` before opening a pull request.

The documentation check validates relative Markdown links and rejects known
retired terms in current documentation. Historical documents are intentionally
excluded from retired-term checks.
