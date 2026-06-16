# Starlens

[English](README.md) | [中文](README.zh-CN.md)

Starlens 是一个面向个人使用的 GitHub Stars 知识工作台。它会把星标仓库同步到 PostgreSQL，并补充轻量摘要、标签、备注、收藏状态、AI 辅助检索、CLI 访问能力和本地 Agent 集成能力，方便你把大量收藏过的项目重新组织起来。

项目当前处于 `v1` 持续开发阶段。目标不是做成一个重量级的 RAG 系统或团队协作平台，而是把个人 Stars 变成真正可搜索、可整理、可复用的工作上下文。

## 它能做什么

- 通过 GitHub OAuth 同步用户的 starred repositories。
- 保存仓库元数据、topics、语言、Stars 数量、时间戳、README 摘要、用户标签、备注和收藏状态。
- 提供桌面工作台 `/app` 和移动工作台 `/mobile`。
- 支持关键词搜索、过滤、排序、仓库详情查看、标签编辑、备注编辑和收藏管理。
- 支持基于 OpenAI-compatible provider 的 AI 辅助仓库召回，或使用环境变量兜底。
- 为 CLI、MCP 和 Agent 工作流提供个人 API Token。
- 在 `/docs` 提供静态产品文档。

## 当前范围

已实现或正在打通的能力：

- 公开落地页与文档路由。
- Web 登录后工作台。
- 移动工作台壳和共享移动状态逻辑。
- 通过 `packages/server` 统一承载 API route 实现。
- GitHub Stars 同步与仓库搜索。
- AI provider 配置、校验和 AI 问答链路。
- CLI 命令：登录、状态、同步、搜索、查看、打开、问答、收藏、备注和标签。
- MCP stdio server，供 IDE 和本地 Agent 使用。

`v1` 明确不做：

- README 全文入库。
- 向量检索、embeddings 和完整 RAG。
- 多 provider 自动回退。
- 多用户协作。
- 通用任意 provider 请求适配器。

## 架构

Starlens 使用 `pnpm` workspace：

```text
apps/
  web/       Web 应用、桌面工作台、落地页、文档和 API 代理
  mobile/    移动端工作台应用
  cli/       基于 token 的本地 CLI
  mcp/       本地 stdio MCP server

packages/
  core/        共享 DTO、类型、mock 数据和仓库文本工具
  server/      认证、数据库、GitHub 同步、搜索、AI 配置、Token 和路由逻辑
  workbench/   共享移动工作台状态与格式化工具
  agent-tools/ MCP/Agent 工具定义与 HTTP API 客户端逻辑

docs/          产品、架构、数据库、环境与集成文档
drizzle/       数据库迁移与快照
scripts/       环境与数据库辅助脚本
```

Web 和 Mobile 对外只暴露薄路由，绝大部分后端逻辑都在 `packages/server` 中复用，因此 CLI、MCP、Web 和 Mobile 使用的是同一套 API 契约。

## 技术栈

- Next.js App Router
- React
- TypeScript
- PostgreSQL
- Drizzle ORM
- NextAuth GitHub OAuth
- Vitest
- MCP SDK
- pnpm workspace

## 环境要求

- Node.js `>=20.11.0`
- 通过 Corepack 使用 `pnpm@10.33.3`
- 本地开发可用 PostgreSQL，托管场景可用 Neon
- 一个 GitHub OAuth 应用

启用 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.33.3 --activate
```

## 本地启动

安装依赖：

```bash
corepack pnpm install
```

复制本地环境变量：

```bash
cp .env.example .env
```

补齐必填项：

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
```

执行数据库迁移：

```bash
corepack pnpm db:migrate:local
```

启动 Web：

```bash
corepack pnpm dev
```

单独启动移动端：

```bash
corepack pnpm dev:mobile
```

## 环境变量

| 变量 | 是否必填 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串。 |
| `AUTH_SECRET` | 是 | NextAuth 会话密钥。 |
| `NEXTAUTH_URL` | 是 | 对外访问地址，例如 `http://localhost:3000`。 |
| `AUTH_GITHUB_ID` | 是 | GitHub OAuth Client ID。 |
| `AUTH_GITHUB_SECRET` | 是 | GitHub OAuth Client Secret。 |
| `TOKEN_ENCRYPTION_SECRET` | 是 | 用于加密 provider key 和个人 token。 |
| `SYSTEM_AI_API_KEY` | 可选 | 系统级默认 AI 密钥，仅在用户没有默认 Provider 时使用。 |
| `SYSTEM_AI_BASE_URL` | 可选 | 系统级 OpenAI-compatible 兜底 Base URL。 |
| `SYSTEM_AI_MODEL` | 可选 | 系统级兜底模型名。 |
| `SYSTEM_AI_PROVIDER_TYPE` | 可选 | 系统级 Provider 类型，默认 `openai_compatible`。 |
| `SYSTEM_AI_ENABLED` | 可选 | 设为 `false` 可关闭系统级兜底。 |

旧的 `OPENAI_*` 变量仍会被读取以兼容迁移，但新部署应使用 `SYSTEM_AI_*`。

如果是 Neon 验证环境，复制 `.env.neon.example` 为 `.env.neon`，并使用带 `sslmode=require` 的 pooled connection string。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `corepack pnpm dev` | 用 `.env` 启动 Web。 |
| `corepack pnpm dev:mobile` | 用 `.env` 启动 Mobile。 |
| `corepack pnpm build` | 构建 Web。 |
| `corepack pnpm build:mobile` | 构建 Mobile。 |
| `corepack pnpm lint` | 运行 Web lint。 |
| `corepack pnpm lint:mobile` | 运行 Mobile lint。 |
| `corepack pnpm test` | 运行 Web 测试。 |
| `corepack pnpm test:mobile` | 运行 Mobile 测试。 |
| `corepack pnpm db:migrate:local` | 应用本地数据库迁移。 |
| `corepack pnpm db:check:local` | 检查本地数据库连接。 |
| `corepack pnpm mcp:start` | 启动本地 Starlens MCP server。 |

包级测试：

```bash
corepack pnpm --filter @starlens/cli test
corepack pnpm --filter @starlens/agent-tools test
corepack pnpm --filter @starlens/workbench test
```

## CLI 用法

先在 Web 里创建个人 token，再登录：

```bash
printf '%s\n' 'stl_xxx' | corepack pnpm --filter @starlens/cli start -- login --token-stdin
```

常用命令：

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

## MCP / Agent 集成

启动本地 MCP server：

```bash
STARLENS_TOKEN="stl_xxx" \
STARLENS_API_BASE_URL="http://localhost:3000" \
corepack pnpm mcp:start
```

Cursor 风格的 MCP 配置：

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

可用 MCP 工具：

- `search_stars`
- `show_star`
- `sync_stars`
- `favorite_star`
- `unfavorite_star`
- `set_star_note`
- `add_star_tag`
- `remove_star_tag`
- `ask_stars`

不要把真实 token 或包含 secret 的 MCP 配置提交到仓库。

## 文档

- [项目计划](docs/project-plan.md)
- [环境分层说明](docs/environments.md)
- [API contract](docs/api-contract.md)
- [数据库 schema](docs/database-schema.md)
- [同步流程设计](docs/sync-flow-design.md)
- [Agent 集成](docs/agent-integration.md)
- [前端实现拆解](docs/frontend-implementation-plan.md)

Web 运行后也会提供 `/docs` 下的用户文档。

## 部署说明

默认部署路径是 Vercel + PostgreSQL，数据库优先推荐 Neon Free。

部署前建议执行：

```bash
corepack pnpm db:migrate:neon
corepack pnpm db:check:neon
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

生产环境变量应与 `.env.neon.example` 对齐，并使用正式的 `NEXTAUTH_URL`。

## 安全说明

- 个人 API token 只会在创建时明文展示一次。
- 存储在服务端的 token 和 provider secret 都会被加密或哈希处理。
- MCP 以本地 stdio 进程运行，不开放公网端口。
- `v1` 以 token 所属用户作为授权边界，不做细粒度 scope 控制。

## 项目状态

Starlens 还不是一个完成态产品。当前最值得继续推进的是生产验证、定时同步、部署文档完善，以及真实移动设备验收。
