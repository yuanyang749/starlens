# Starlens

[English](README.md) | [中文](README.zh-CN.md)

Starlens 是一个面向个人使用的 GitHub Stars 知识工作台。它会把星标仓库同步到 PostgreSQL，并补充轻量摘要、标签、备注、收藏状态、AI 辅助检索、CLI 访问能力和本地 Agent 集成能力，方便你把大量收藏过的项目重新组织起来。

项目当前处于 `v1` 持续开发阶段。目标不是做成一个重量级的 RAG 系统或团队协作平台，而是把个人 Stars 变成真正可搜索、可整理、可复用的工作上下文。

## 它能做什么

- 通过 GitHub OAuth 同步用户的 starred repositories。
- 保存仓库元数据、topics、语言、Stars 数量、时间戳、README 摘要、用户标签、备注和收藏状态。
- 提供桌面工作台 `/app` 和移动工作台 `/mobile`。
- 支持关键词搜索、过滤、排序、仓库详情查看、标签编辑、备注编辑和收藏管理。
- 支持高级搜索过滤：Star 数区间、收藏时间范围、最近推送时间、备注内容关键词等。
- 支持基于自然语言的 AI 问答，内置 8 种意图类型：统计数量、存在性检查、双仓库对比、分布统计、推荐、单仓库分析、条件过滤和语义搜索。
- 为 CLI、MCP 和 Agent 工作流提供个人 API Token。
- 通过 `stars install-skill` 一键安装 Agent Skill，支持 Claude Code、Cursor、Codex、opencode 等主流 AI 客户端。
- 在 `/docs` 提供静态产品文档。

## 当前范围

已实现或正在打通的能力：

- 公开落地页、文档、更新日志、隐私政策和使用条款路由。
- Web 登录后工作台。
- 移动工作台壳和共享移动状态逻辑。
- 通过 `packages/server` 统一承载 API route 实现。
- GitHub Stars 同步与仓库搜索（含高级过滤字段）。
- AI provider 配置、校验和 8 种意图的 AI 问答链路。
- CLI（`@starlens-app/cli`）已发布至 npm：`stars` 命令支持登录、状态、同步、搜索、查看、打开、问答、收藏、备注、标签和 `install-skill`。
- MCP stdio server，供 IDE 和本地 Agent 使用。
- HTTP MCP 端点，供托管客户端（Claude Code、Cursor）使用。
- Agent Skill 一键安装，支持 Claude Code、Cursor、Codex、opencode、OpenClaw、Hermes 和 VS Code。

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
  cli/       基于 token 的本地 CLI（@starlens-app/cli）
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
| `corepack pnpm build:packages` | 构建内部包（遇到类型报错时先执行这个）。 |
| `corepack pnpm lint` | 运行 Web lint。 |
| `corepack pnpm lint:mobile` | 运行 Mobile lint。 |
| `corepack pnpm test` | 运行 Web 测试。 |
| `corepack pnpm test:mobile` | 运行 Mobile 测试。 |
| `corepack pnpm db:migrate:local` | 应用本地数据库迁移。 |
| `corepack pnpm db:check:local` | 检查本地数据库连接。 |
| `corepack pnpm mcp:start` | 启动本地 Starlens MCP server。 |

包级测试：

```bash
corepack pnpm --filter @starlens-app/cli test
corepack pnpm --filter @starlens-app/agent-tools test
corepack pnpm --filter @starlens/workbench test
```

## CLI 用法

CLI 已发布到 npm，可全局安装：

```bash
npm install -g @starlens-app/cli
```

先在 Web 里创建个人 token，再登录：

```bash
printf '%s\n' 'stl_xxx' | stars login --token-stdin
```

常用命令：

```bash
stars status
stars sync
stars search "agent framework"
stars show owner/repo
stars ask "哪些仓库适合做本地 agent 工具？"
stars ask "我有多少个 TypeScript 项目？"
stars favorite owner/repo
stars note owner/repo --set "Review for MCP integration"
stars tag add owner/repo agent
```

一键安装 Agent Skill：

```bash
stars install-skill
```

向导会引导你选择客户端（Claude Code、Cursor、Codex、opencode 等），自动安装 Skill 文件，并可选写入 MCP 配置。

如果在 monorepo 内开发时直接调用：

```bash
corepack pnpm --filter @starlens-app/cli start -- <命令>
```

## MCP / Agent 集成

### 托管 HTTP MCP（推荐，适合大多数客户端）

如果使用托管服务 `https://starlens.520ai.xin`，通过 HTTP MCP 连接，无需本地进程：

**Claude Code：**

```bash
claude mcp add-json starlens '{
  "type": "http",
  "url": "https://starlens.520ai.xin/mcp",
  "headers": { "Authorization": "Bearer stl_xxx" }
}'
```

**Cursor**（`~/.cursor/mcp.json`）：

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

**opencode**（`~/.config/opencode/opencode.json`）：

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

**Codex**（`~/.codex/config.toml`）：

```toml
[mcp_servers.starlens]
url = "https://starlens.520ai.xin/mcp"
http_headers = {Authorization = "Bearer stl_xxx"}
startup_timeout_sec = 30
default_tools_approval_mode = "approve"
```

### 自部署 stdio MCP

连接自己部署的 Starlens 实例：

```bash
STARLENS_TOKEN="stl_xxx" \
STARLENS_API_BASE_URL="http://localhost:3000" \
corepack pnpm mcp:start
```

Cursor 风格的 stdio 配置：

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

### 可用 MCP 工具

| 工具 | 用途 |
| --- | --- |
| `search_stars` | 搜索和过滤 starred repositories |
| `show_star` | 查看单个仓库详情 |
| `sync_stars` | 触发 GitHub Stars 同步 |
| `favorite_star` | 标记重点收藏（仅本地标记，不影响 GitHub 上的真实 star 状态） |
| `unfavorite_star` | 取消重点收藏（仅本地标记，不影响 GitHub 上的真实 star 状态） |
| `star_repo` | 真实调用 GitHub star API（支持任意 owner/repo，哪怕之前从未收藏过） |
| `unstar_repo` | 真实调用 GitHub unstar API，从 GitHub 上移除 star |
| `set_star_note` | 设置或清空备注 |
| `add_star_tag` | 添加标签 |
| `remove_star_tag` | 删除标签 |
| `ask_stars` | 对收藏仓库发起自然语言 AI 问答 |
| `analyze_repo` | 分析仓库并给出标签/备注建议（已收藏或未收藏均可） |
| `recommend_for_task` | 根据编码任务从收藏中推荐相关仓库 |
| `find_related` | 发现与某个仓库相关的收藏仓库 |
| `suggest_organization` | 建议清理重复/过时/未打标签的仓库 |
| `get_sync_summary` | 汇总自上次同步以来的变化 |

不要把真实 token 或包含 secret 的 MCP 配置提交到仓库。

## 文档

用户文档可在 Web 运行后通过 `/docs` 访问：

- [功能说明](/docs/features) — 搜索、过滤、AI 问答意图类型、标签、备注
- [技术架构](/docs/architecture) — 模块划分与数据流
- [对接配置](/docs/integrations) — GitHub OAuth、API Token、AI Provider、CLI、MCP
- [部署方式](/docs/deployment) — Docker 自托管、Node.js、本地开发

内部设计与 API 文档：

- [项目计划](docs/project-plan.md)
- [环境分层说明](docs/environments.md)
- [API contract](docs/api-contract.md)
- [数据库 schema](docs/database-schema.md)
- [同步流程设计](docs/sync-flow-design.md)
- [Agent 集成](docs/agent-integration.md)

## 部署说明

主要部署路径是 Docker 自托管 + PostgreSQL。完整指南见[部署文档](https://starlens.520ai.xin/docs/deployment)。

Docker 快速参考：

```bash
# 执行迁移
docker compose -f deploy/docker-compose.yml --profile migrate run --rm starlens-migrate

# 构建并启动
docker compose -f deploy/docker-compose.yml up -d --build starlens-web
```

部署前建议执行：

```bash
corepack pnpm test
corepack pnpm lint
```

## 安全说明

- 个人 API token 只会在创建时明文展示一次。
- 存储在服务端的 token 和 provider secret 都会被加密或哈希处理。
- MCP 以本地 stdio 进程运行，不开放公网端口。
- `v1` 以 token 所属用户作为授权边界，不做细粒度 scope 控制。

## 参与贡献

欢迎贡献代码、文档或反馈问题。请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解本地环境搭建、PR 流程、代码规范和新手入口。

## 项目状态

核心功能已稳定运行于生产环境。当前开发重点：

- 扩展 AI 问答覆盖范围和准确度。
- 定时自动同步。
- 移动工作台完善与真机测试。
- 部署文档和自托管体验优化。
