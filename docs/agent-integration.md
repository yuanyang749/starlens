# Starlens Agent / IDE 集成

## 1. 当前定位

Starlens 对 agent 和 IDE 的支持分为两层：

- HTTP API
  - 所有 agent 都可以直接使用 `Authorization: Bearer <token>` 调用 `/api/*`
  - 适合 Hermes、OpenClaw 或自定义 agent runtime
- MCP server
  - 本地 stdio server，位于 `apps/mcp`
  - 适合 Cursor、支持 MCP 的 IDE 和桌面 agent 客户端

MCP 层不重新实现业务逻辑，只复用 `packages/agent-tools`，再由该包调用现有 HTTP API。

## 2. 前置条件

1. 在 Starlens Web 的 token 设置页创建一个 CLI / Agent token。
2. 保留创建时返回的明文 token。
3. 确认 Starlens Web/API 可访问。

本地开发默认 API 地址：

```bash
http://localhost:3000
```

生产或自部署时将 `STARLENS_API_BASE_URL` 改为对应站点地址。

## 3. MCP 启动

在仓库根目录运行：

```bash
STARLENS_TOKEN="stl_xxx" \
STARLENS_API_BASE_URL="http://localhost:3000" \
corepack pnpm mcp:start
```

可用环境变量：

- `STARLENS_TOKEN`
  - 必填
  - Web 设置页创建的 CLI / Agent token
- `STARLENS_API_BASE_URL`
  - 可选
  - 默认 `http://localhost:3000`

## 4. Cursor 示例

在项目或用户级 MCP 配置中添加：

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

说明：

- `cwd` 必须指向 Starlens 仓库根目录。
- 不要把真实 token 提交到仓库。
- 如果 Cursor 配置支持环境变量引用，优先引用系统环境变量。

## 5. Hermes / OpenClaw 示例

如果 runtime 支持 MCP stdio server，使用同样的命令：

```bash
corepack pnpm mcp:start
```

并传入：

```bash
STARLENS_TOKEN=stl_xxx
STARLENS_API_BASE_URL=https://your-starlens.example.com
```

如果 runtime 只支持 HTTP tool，则直接调用 Starlens HTTP API：

```http
Authorization: Bearer stl_xxx
```

## 6. MCP 工具清单

- `search_stars`
  - 搜索和过滤 starred repositories
- `show_star`
  - 查看单个仓库详情
- `sync_stars`
  - 触发 GitHub Stars 同步
- `favorite_star`
  - 收藏仓库
- `unfavorite_star`
  - 取消收藏仓库
- `set_star_note`
  - 设置或清空备注
- `add_star_tag`
  - 添加标签
- `remove_star_tag`
  - 删除标签
- `ask_stars`
  - 调用 Starlens AI 问答

## 7. 安全边界

- token 只存哈希，明文只在创建时返回一次。
- `v1` token 是用户级粗粒度权限，不做 scope 权限矩阵。
- MCP server 是本地 stdio 进程，不额外开放公网端口。
- agent 侧应避免把 token 写入可提交的项目文件。
