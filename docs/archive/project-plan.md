# Starlens 项目计划

> **归档说明（2026-07-08）**：v1 目标已基本达成，本文档不再是当前实现的权威参考，仅作为项目早期取舍决策的历史记录保留。当前 API/数据结构以 `docs/api-contract.md`、`docs/database-schema.md` 为准。

## 1. 项目目标

Starlens 是一个面向个人使用的 GitHub Star 仓库检索与整理工具，目标是解决下面几个问题：

- Star 过的仓库越来越多，靠 GitHub 原生界面很难快速找回
- 想知道某个仓库是谁写的、星标多少、主要解决什么问题
- 想给仓库补充自己的标签、备注和收藏状态
- 希望网页、CLI、agent 都能复用同一套能力

`v1` 先优先满足个人高效使用，但整体设计从一开始就保持可开源、可自部署、可扩展。

## 2. 产品范围

### v1 要做

- 公开落地页
- GitHub 登录
- 登录后工作台
- 首次同步 starred repos
- 手动同步和定时同步
- 仓库搜索与过滤
- 仓库详情查看
- 标签、备注、收藏管理
- AI Provider 设置页
- CLI / Agent Token 管理页
- CLI 访问能力
- Agent 访问能力
- AI 增强检索与摘要
- 落地页中的 Remotion 辅助演示视频

### v1 不做

- README 全文入库
- 向量检索、embeddings、RAG
- 多 provider 自动回退
- 多用户协作
- 任意 HTTP 请求结构的万能 AI 适配器

## 3. 总体架构

项目采用 `pnpm` workspace：

- `apps/web`
  - Next.js App Router
  - 承载桌面 Web UI、公开落地页、文档页和桌面工作台入口
  - 通过轻量 API route 转发到共享服务包
- `apps/mobile`
  - Next.js App Router
  - 承载手机端工作台入口和移动端展示逻辑
  - 复用共享服务包与共享工作台状态逻辑
- `apps/mcp`
  - 本地 stdio MCP server
  - 面向 Cursor、Codex、opencode、Claude Code 和支持 MCP 的 IDE 暴露 Starlens 工具
- `apps/cli`
  - 命令行工具
  - 通过个人 token 调用后端 API
- `packages/core`
  - 共享 schema 和 DTO
  - 搜索排序类型、仓库数据类型和跨端基础工具
- `packages/server`
  - GitHub 同步逻辑
  - 搜索与仓库查询逻辑
  - README 摘要提取
  - AI provider 抽象
  - 鉴权、token、数据库和 API route 处理器
- `packages/workbench`
  - 跨端工作台状态逻辑
  - 移动端列表、详情、同步、AI 搜索、标签和备注的共享 hook
  - 工作台展示格式化工具
- `packages/agent-tools`
  - HTTP agent / MCP 工具清单与调用逻辑
  - 通过 Bearer Token 调用现有 HTTP API
  - 避免 MCP 协议适配层直接耦合业务逻辑

部署方式：

- Web 与 API 统一走 Docker 或 Node.js 自托管部署
- 数据库存储使用 PostgreSQL
- 优先使用 `Docker + PostgreSQL` 起步

### 3.1 Web 分层

Web 端拆分为两层：

- 公开层
  - 路由：`/`
  - 职责：落地页、产品说明、登录承接、开源与能力展示
- 应用层
  - 路由：`/app`
  - 职责：真实搜索、同步、整理、AI 和配置功能
- 移动应用层
  - 路由：`/mobile`
  - 职责：手机端搜索、同步、整理、AI 和配置功能
  - 入口规则：移动设备访问 `/app` 时自动跳转到 `/mobile`，桌面设备访问 `/mobile` 时回到 `/app`

`v1` 继续采用分路由结构，而不是把落地页和工作台混在同一个页面里。

### 3.2 设置域

应用层下继续拆分设置子路由：

- `/app/settings`
- `/app/settings/ai`
- `/app/settings/tokens`

移动端当前采用底部导航承载设置入口：

- `/mobile`
  - 主列表、收藏、最近、设置共用同一个移动工作台壳
  - 详情通过 `repo` query 参数打开独立覆盖层

### 3.3 当前实现进度

截至当前分支 `落地页重构`：

- 公开落地页已完成中文界面重构，并补充点击火花交互与文档页入口
- 桌面工作台继续保留 `/app` 作为主入口
- 移动端已新增独立 `apps/mobile` 应用和 Web 内 `/mobile` 路由
- API route 已迁移到 `packages/server`，Web 和 Mobile 端通过薄路由复用同一套服务实现
- 工作台移动端状态逻辑已抽到 `packages/workbench`
- 移动端已覆盖搜索、AI 搜索、同步、收藏、备注、标签、详情、AI Provider 和 Token 管理
- 后续需要补充真实移动设备视觉验收、构建验证和文档页内容细化

## 4. 数据策略

### 4.1 Star 仓库存储

每个 starred repo 至少保存这些字段：

- 仓库名
- owner / 作者
- 描述
- topics
- language
- star 数
- fork 数
- 默认分支
- GitHub 链接
- 创建时间
- 更新时间
- 用户 star 时间

### 4.1.1 GitHub 原生字段约定

`v1` 的核心仓库数据以 GitHub `GET /user/starred` 返回的仓库对象为基础，并在请求时使用可返回 `starred_at` 的媒体类型。

优先保存下列 GitHub 原生字段：

- `id`
- `name`
- `full_name`
- `owner.login`
- `owner.avatar_url`
- `html_url`
- `description`
- `topics`
- `language`
- `stargazers_count`
- `forks_count`
- `watchers_count`
- `open_issues_count`
- `default_branch`
- `homepage`
- `license`
- `archived`
- `disabled`
- `fork`
- `private`
- `visibility`
- `created_at`
- `updated_at`
- `pushed_at`
- `starred_at`

这些字段足以支撑 `v1` 的主列表、过滤器和详情面板的大部分展示。

### 4.1.2 需要额外请求补充的字段

有些数据不建议在初次同步时无限制全量抓取，但可以按策略补拉：

- README 内容
  - 来源：`GET /repos/{owner}/{repo}/readme`
  - 用途：提取 `repo_summary` 和 `readme_excerpt`
- 语言明细
  - 来源：`GET /repos/{owner}/{repo}/languages`
  - 用途：后续增强语言信息或分析视图

`v1` 默认不依赖贡献者、发行版、提交统计等更重字段。

### 4.2 README 策略

`v1` 不保存 README 全文。

同步时只提取三类轻量信息：

- `repo_summary`
  - 一句话概括仓库主要解决什么问题
- `readme_excerpt`
  - README 开头最有信息量的一小段
- `search_document`
  - 用于数据库搜索的合并文本

`search_document` 仅合并高价值内容：

- 仓库名
- owner
- 描述
- topics
- summary
- 用户标签
- 用户备注

### 4.3 本地派生与本地维护字段

除 GitHub 原生字段外，系统需要维护以下本地字段：

#### 本地派生字段

- `repo_summary`
  - 从 `description + topics + README 前几段` 提炼的一句话摘要
- `readme_excerpt`
  - README 中一小段最有信息量的内容
- `search_document`
  - 合并仓库名、owner、描述、topics、摘要、标签、备注后的搜索文本

#### 本地维护字段

- `is_favorite`
- `is_starred`
- `unstarred_at`
- `user_tags`
- `user_note`
- `last_synced_at`
- `ai_summary`

## 4.4 字段与界面映射

为避免界面设计与可实现字段脱节，`v1` 的 Web UI 字段映射先固定如下。

### 主列表

- 仓库名：`full_name`
- 作者：`owner.login`
- 一句话说明：优先 `repo_summary`，没有时回退到 `description`
- Star 数：`stargazers_count`
- 语言：`language`
- 更新时间：`pushed_at`
- 标签：`user_tags`
- 收藏状态：`is_favorite`
- 备注状态：根据 `user_note` 是否为空显示

### 右侧详情面板

- GitHub 链接：`html_url`
- 仓库标题：`full_name`
- 仓库摘要：`repo_summary`
- 原始描述：`description`
- Topics：`topics`
- 许可证：`license`
- 默认分支：`default_branch`
- Star / Fork / Issue 数：`stargazers_count`、`forks_count`、`open_issues_count`
- 是否归档：`archived`
- README 摘要：`readme_excerpt`
- 标签、备注、收藏：本地字段

## 5. AI 设计

### 5.1 AI 的角色

AI 不直接替代数据库搜索，而是做搜索增强层：

1. 数据库先召回候选仓库
2. AI 只处理前 `10-30` 个候选
3. AI 输出更自然的解释、摘要和排序

### 5.2 AI 的能力范围

- `问答`
  - 例：我之前收藏过一个做 React 表格虚拟滚动的库，帮我找找
- `候选重排`
  - 根据用户问题，对候选仓库重新排序并解释原因
- `仓库摘要`
  - 提炼仓库主要解决的问题、适用场景和价值点

### 5.3 支持的 AI Provider

每个用户可自行选择使用哪种协议：

- `OpenAI 兼容接口`
- `Anthropic 官方协议`
- `Gemini 官方协议`

说明：

- `OpenAI 兼容接口` 指任何兼容 OpenAI 风格请求的第三方端点
- 可以覆盖 DeepSeek、部分 Kimi / MiniMax 兼容网关、聚合平台和自建兼容网关

### 5.4 Provider 规则

- 每个用户可以保存多套 AI 配置
- 每次请求只使用一套 provider
- 默认使用用户自己设定的默认 provider
- 如果 provider 支持模型列表，前端可动态拉取
- 如果不支持，退回为手动填写 model id
- 保存配置前要做连通性校验

## 6. 数据库设计

### 核心表

- `users`
  - 用户身份与偏好
- `github_accounts`
  - GitHub OAuth 绑定信息和同步所需 token 元数据
- `starred_repos`
  - 用户的 starred repo 快照
- `repo_tags`
  - 用户标签
- `repo_notes`
  - 用户备注
- `personal_api_tokens`
  - CLI / agent 使用的 token，仅存哈希
- `user_ai_configs`
  - 用户自己的 AI provider 配置

### 需要保存的 AI 配置字段

- `provider_type`
- `display_name`
- `model`
- `enabled`
- `is_default`
- `base_url`
- `api_key_encrypted`
- `extra_headers_encrypted`
- `last_validated_at`
- `last_validation_status`
- `last_validation_error`

## 7. 搜索与同步

### 搜索流程

1. PostgreSQL 全文检索召回结果
2. 结合语言、owner、tag、收藏状态等过滤器筛选
3. 默认排序优先级：
   - 精确 / 短语命中
   - 仓库名 / owner 命中
   - 描述 / topics 命中
   - summary / excerpt 命中
   - 标签 / 备注命中
4. 如开启 AI 增强，再进行候选重排或问答

### 同步策略

- 首次同步：拉取全部 starred repos
- 手动同步：用户主动触发
- 定时同步：默认每隔一天刷新一次
- README 摘要仅在新仓库或仓库内容明显变化时重新提取

## 8. 对外接口

### Web

- 公开落地页
- GitHub OAuth 登录
- 登录后工作台
- 搜索、过滤、查看详情
- 编辑标签、备注、收藏
- 管理 AI 配置
- 生成与撤销个人 token
- 落地页中的产品预览和 Remotion 辅助演示

### CLI

计划支持：

- `stars login --token <token>`
- `stars login --token-stdin`
- `stars logout`
- `stars status`
- `stars sync`
- `stars search "<query>"`
- `stars show <repo-or-id>`
- `stars open <repo-or-id>`
- `stars ask "<question>"`
- `stars favorite <repo-or-id>`
- `stars unfavorite <repo-or-id>`
- `stars note <repo-or-id> --set "<text>"`
- `stars note <repo-or-id> --clear`
- `stars tag add <repo-or-id> <tag>`
- `stars tag remove <repo-or-id> <tag>`

### Agent

Hermes、OpenClaw 和自定义 agent runtime 通过 Bearer Token 访问同一套 HTTP API，支持：

- 搜索
- 查看详情
- 更新标签 / 备注 / 收藏
- 触发同步
- 使用 AI 问答、重排和摘要

Cursor、Codex、opencode、Claude Code 和支持 MCP 的 IDE 额外提供本地 MCP server：

- 启动命令：`corepack pnpm mcp:start`
- 环境变量：`STARLENS_TOKEN`、`STARLENS_API_BASE_URL`
- MCP 工具：搜索、详情、同步、收藏、备注、标签和 AI 问答

## 9. HTTP API 草案

- `POST /api/sync`
- `GET /api/search`
- `GET /api/repos/:id`
- `PATCH /api/repos/:id`
- `POST /api/repos/:id/tags`
- `DELETE /api/repos/:id/tags/:tag`
- `GET /api/tokens`
- `POST /api/tokens`
- `DELETE /api/tokens/:id`
- `GET /api/ai/configs`
- `POST /api/ai/configs`
- `PATCH /api/ai/configs/:id`
- `DELETE /api/ai/configs/:id`
- `POST /api/ai/configs/:id/validate`
- `GET /api/ai/configs/:id/models`
- `POST /api/ai/ask`
- `POST /api/ai/rerank`
- `POST /api/ai/summarize`

## 10. 验收标准

- 公开落地页与登录后工作台边界清晰
- GitHub 登录和同步流程可用
- 大量 starred repos 可正确导入且不重复
- 搜索可命中仓库名、作者、描述、topics、标签、备注和摘要
- 不保存 README 全文的情况下，仍能快速找回仓库
- 标签、备注、收藏能即时生效
- CLI 和 agent 能安全调用 API
- AI provider 可按用户配置独立工作
- Docker 自托管部署和 Neon 免费层可支持个人低频使用
- 落地页中的产品截图、短视频与工作台风格一致

## 11. 文档地图

当前 `docs` 目录中的专项文档分工如下：

- `project-plan.md`
  - 总纲文档，负责汇总目标、边界、核心决策
- `landing-page-design.md`
  - 落地页定位、页面结构、Remotion 视频策略
- `web-ui-design.md`
  - 工作台和应用层 UI 风格
- `information-architecture.md`
  - 路由结构、页面地图、导航关系
- `database-schema.md`
  - PostgreSQL 数据模型与索引草案
- `api-contract.md`
  - HTTP API 契约
- `sync-flow-design.md`
  - GitHub 同步、README 摘要和 `search_document` 更新链路
- `frontend-implementation-plan.md`
  - 前端路由、组件和页面状态拆解

## 12. 当前默认决策

- 技术栈：`Next.js + TypeScript + PostgreSQL + Auth.js + pnpm workspace`
- 部署：`Docker 自托管`
- 数据库：`Neon Free`
- README：只存摘要和 excerpt，不存全文
- AI：支持 OpenAI-compatible、Anthropic、Gemini
- AI 调用模式：用户手动选择 provider，不做自动回退
- Web 结构：`/` 为落地页，`/app` 为工作台
- 设置域：`/app/settings/ai` 与 `/app/settings/tokens` 独立存在
- 落地页媒体：产品截图为主，Remotion 视频为辅助
- 视频策略：一条主短片 + 两条补充微演示
- 仓库取消 star 后，默认优先考虑软删除保留整理上下文
