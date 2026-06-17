# 环境分层说明

StarLens 默认按三层环境使用数据库，避免本地开发误操作远程 Neon 数据。

## 本地开发

本地开发使用 Docker Postgres，配置文件是仓库根目录的 `.env`。

推荐命令：

```bash
npm run dev:local
npm run db:migrate:local
npm run db:check:local
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
npm run db:migrate:neon
npm run db:check:neon
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
```

旧的 `OPENAI_*` 变量仅保留迁移兼容，新环境统一使用 `SYSTEM_AI_*`。

上线前最小验证顺序：

```bash
npm run db:migrate:neon
npm run db:check:neon
npm run test
npm run lint
npm run build
```
