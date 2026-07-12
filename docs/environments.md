# 环境分层说明

> 当前工程参考。最后按根目录脚本和环境变量模板核对：2026-07-11。
> 命令、默认值发生变化时，应同时更新本文件、根目录 README 和对应 `.env*.example`。

StarLens 默认按三层环境使用数据库，避免本地开发误操作远程 Neon 数据。

## 本地开发

本地开发使用 Docker Postgres，配置文件是仓库根目录的 `.env`。

推荐命令：

```bash
corepack pnpm dev:local
corepack pnpm db:migrate:local
corepack pnpm db:check:local
```

当前本地默认连接串格式：

```bash
DATABASE_URL=postgres://starlens:starlens@localhost:54329/starlens_dev
```

本地库适合反复迁移、清库、跑测试和调试 AI 配置保存流程。

## Neon 集成验证

Neon Free 用于部署前或 PR 合并前的集成验证，配置文件是仓库根目录的 `.env.neon`。这个文件不要提交。

首次配置可以从 `.env.neon.example` 复制：

```bash
cp .env.neon.example .env.neon
```

推荐命令：

```bash
corepack pnpm db:migrate:neon
corepack pnpm db:check:neon
```

Neon 建议使用 pooled connection string，并保留 `sslmode=require`。

## 生产部署

生产环境使用托管 PostgreSQL 或自管 PostgreSQL 的连接串，不使用本地 Docker 连接串。

关键变量：

```bash
DATABASE_URL=
AUTH_SECRET=
NEXTAUTH_URL=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
TOKEN_ENCRYPTION_SECRET=
SYSTEM_AI_API_KEY=
SYSTEM_AI_BASE_URL=
SYSTEM_AI_MODEL=
SYSTEM_AI_PROVIDER_TYPE=openai_compatible
SYSTEM_AI_ENABLED=true
SYSTEM_AI_FALLBACK_MODEL=
SYSTEM_AI_EXTRA_HEADERS=
```

旧的 `OPENAI_*` 变量仅保留迁移兼容，新环境统一使用 `SYSTEM_AI_*`。

`SYSTEM_AI_FALLBACK_MODEL` 只用于同一网关和同一 API Key 下的单次模型降级。
`SYSTEM_AI_EXTRA_HEADERS` 必须是 JSON 对象字符串；无额外 Header 时留空。

上线前最小验证顺序：

```bash
corepack pnpm db:migrate:neon
corepack pnpm db:check:neon
corepack pnpm test
corepack pnpm lint
corepack pnpm build
corepack pnpm check:docs
```
