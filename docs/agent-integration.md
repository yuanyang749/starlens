# Starlens Agent / IDE 集成

## 1. 当前定位

Starlens 对 agent 和 IDE 的支持分为两条明确路径：

- Agent Skill + HTTP API
  - Hermes、OpenClaw 或自定义 agent runtime 的默认接入方式
  - 先加载 `skills/starlens/SKILL.md` 作为行为协议
  - 使用 `Authorization: Bearer <token>` 直接调用 `/api/*`
  - 适合服务端、容器、远程 worker 和需要审计/重试/限流的运行时
- MCP server
  - 本地 stdio server，位于 `apps/mcp`
  - 只推荐给 Codex、opencode、Claude Code、Cursor、支持 MCP 的 IDE 和桌面 MCP 客户端

MCP 层不重新实现业务逻辑，只复用 `packages/agent-tools`，再由该包调用现有 HTTP API。对 Hermes、OpenClaw 这类 agent runtime，优先保持最短链路：`agent runtime -> Starlens Skill -> Starlens HTTP API`。

## 2. 前置条件

1. 在 Starlens Web 的 token 设置页创建一个 CLI / Agent token。
2. 保留创建时返回的明文 token。
3. 确认 Starlens Web/API 可访问。

本地开发默认 API 地址：

```bash
http://localhost:3000
```

生产或自部署时将 `STARLENS_API_BASE_URL` 改为对应站点地址。

## 3. Agent Skill 接入

Hermes、OpenClaw 和自定义 agent runtime 应先加载仓库内 skill，再按 skill 中的规则调用 HTTP API。Skill 是 agent 的配置载体，负责说明调用时机、端点选择、Token 处理、错误恢复和返回值解释。

Skill 文件：

```text
skills/starlens/SKILL.md
```

HTTP 参考：

```text
skills/starlens/references/http-api.md
```

基础配置如下：

```bash
STARLENS_SKILL_FILE="/path/to/starlens/skills/starlens/SKILL.md"
STARLENS_TOKEN="stl_xxx"
STARLENS_API_BASE_URL="https://your-starlens.example.com"
```

如果 Agent 支持 skill/instruction 文件，直接指向 `STARLENS_SKILL_FILE`。如果 Agent 只支持 system prompt，把 `SKILL.md` 内容放入长期指令，把 Token 放在 secret/env 配置里。

统一请求头：

```http
Authorization: Bearer stl_xxx
```

常用 HTTP tool 映射：

| Agent 工具 | HTTP 接口 | 方法 |
| --- | --- | --- |
| `search_stars` | `/api/search?q={query}&pageSize={pageSize}` | `GET` |
| `show_star` | `/api/repos/{repoIdOrFullName}` | `GET` |
| `sync_stars` | `/api/sync` | `POST` |
| `favorite_star` | `/api/repos/{repoIdOrFullName}`（仅本地标记） | `PATCH` |
| `unfavorite_star` | `/api/repos/{repoIdOrFullName}`（仅本地标记） | `PATCH` |
| `star_repo` | `/api/repos/star`（真实 GitHub star） | `POST` |
| `unstar_repo` | `/api/repos/unstar`（真实 GitHub unstar） | `POST` |
| `set_star_note` | `/api/repos/{repoIdOrFullName}` | `PATCH` |
| `add_star_tag` | `/api/repos/{repoIdOrFullName}/tags` | `POST` |
| `remove_star_tag` | `/api/repos/{repoIdOrFullName}/tags/{tag}` | `DELETE` |
| `ask_stars` | `/api/ai/ask` | `POST` |
| `analyze_repo` | `/api/ai/analyze` | `POST` |
| `recommend_for_task` | `/api/ai/recommend` | `POST` |
| `find_related` | `/api/ai/related` | `POST` |
| `suggest_organization` | `/api/repos/suggestions` | `GET` |
| `get_sync_summary` | `/api/sync/summary` | `GET` |

最小搜索示例：

```bash
curl "$STARLENS_API_BASE_URL/api/search?q=react&pageSize=10" \
  -H "Authorization: Bearer $STARLENS_TOKEN"
```

设置备注示例：

```bash
curl -X PATCH "$STARLENS_API_BASE_URL/api/repos/{repoIdOrFullName}" \
  -H "Authorization: Bearer $STARLENS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"适合做 Agent 检索上下文。"}'
```

## 4. Cursor / IDE MCP 启动

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

## 5. Cursor 示例

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

## 6. 终端 Coding CLI 示例

Codex、opencode、Claude Code 这类终端 coding CLI 属于本地开发工具客户端，推荐使用 MCP。它们可以自动发现 Starlens 工具，并在对话中直接调用 `search_stars`、`show_star` 和 `ask_stars`。

为了避免把 token 写进多个配置文件，建议先创建本机私有 env 文件：

```bash
mkdir -p ~/.starlens
chmod 700 ~/.starlens

cat > ~/.starlens/agent.env <<'EOF'
export STARLENS_TOKEN="stl_xxx"
export STARLENS_API_BASE_URL="http://localhost:3000"
EOF

chmod 600 ~/.starlens/agent.env
```

Codex `~/.codex/config.toml`：

```toml
[mcp_servers.starlens]
type = "stdio"
command = "zsh"
args = ["-lc", "source \"$HOME/.starlens/agent.env\" && cd \"/path/to/starlens\" && corepack pnpm mcp:start"]
startup_timeout_sec = 30
default_tools_approval_mode = "approve"
```

opencode `~/.config/opencode/opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "starlens": {
      "type": "local",
      "command": [
        "zsh",
        "-lc",
        "source \"$HOME/.starlens/agent.env\" && cd \"/path/to/starlens\" && corepack pnpm mcp:start"
      ],
      "enabled": true,
      "timeout": 10000
    }
  }
}
```

Claude Code：

```bash
claude mcp add-json starlens '{
  "type": "stdio",
  "command": "zsh",
  "args": [
    "-lc",
    "source \"$HOME/.starlens/agent.env\" && cd \"/path/to/starlens\" && corepack pnpm mcp:start"
  ]
}'
```

验证提示示例：

```text
Use the starlens MCP tool to search my starred repositories for react with pageSize 1.
```

## 7. MCP 工具清单

- `search_stars`
  - 搜索和过滤 starred repositories
- `show_star`
  - 查看单个仓库详情
- `sync_stars`
  - 触发 GitHub Stars 同步
- `favorite_star`
  - 标记为收藏（仅本地 Starlens 标记，不影响 GitHub 上的真实 star 状态）
- `unfavorite_star`
  - 取消收藏标记（仅本地 Starlens 标记，不影响 GitHub 上的真实 star 状态）
- `star_repo`
  - 真实调用 GitHub star API。支持任意 `owner/repo`（哪怕从未收藏过）或已有的 Starlens id/fullName
- `unstar_repo`
  - 真实调用 GitHub unstar API，仓库会从用户 GitHub Stars 页面消失。仅对已在 Starlens 收藏列表中的仓库生效
- `set_star_note`
  - 设置或清空备注
- `add_star_tag`
  - 添加标签
- `remove_star_tag`
  - 删除标签
- `ask_stars`
  - 调用 Starlens AI 问答
- `analyze_repo`
  - 仓库分析 + 智能标注建议（已 star 用本地数据，未 star 实时拉 GitHub）
- `recommend_for_task`
  - 基于编码任务描述，从 starred repos 召回相关仓库
- `find_related`
  - 给定一个仓库，发现收藏中的关联仓库
- `suggest_organization`
  - 知识整理建议（重复 / 过时 / 未分类）
- `get_sync_summary`
  - 汇总最近一次同步的新增 / 移除 / 变化

Hermes、OpenClaw 不需要通过 MCP 使用这些能力。它们应按第 3 节加载 StarLens skill，并把同名能力映射为 HTTP tools。

## 8. 安全边界

- token 只存哈希，明文只在创建时返回一次。
- `v1` token 是用户级粗粒度权限，不做 scope 权限矩阵。
- MCP server 是本地 stdio 进程，不额外开放公网端口。
- agent 侧应避免把 token 写入可提交的项目文件。
