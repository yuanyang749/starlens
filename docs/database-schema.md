# Starlens 数据库结构

> 当前工程参考。最后按 `packages/server/src/db/schema.ts` 和
> `apps/web/drizzle/` 核对：2026-07-15。Drizzle schema 与已提交迁移是最终权威来源。

## 1. 文档目标

这份文档用于说明 Starlens 当前 PostgreSQL 数据结构，明确：

- 核心表及其职责
- 关键字段
- 主键、唯一约束与外键关系
- 搜索、同步和配置场景需要的索引
- `v1` 明确做和不做的边界

这是一份工程参考，服务迁移审查、ORM 建模和 API 实现。字段或索引变更必须先修改 Drizzle schema 并生成迁移，再同步本文档。

## 2. 设计原则

- 以“个人优先，但可开源扩展”为前提，所有核心数据都按多用户建模
- GitHub 原生数据与用户私有整理数据分离
- README 不存全文，只存摘要和 excerpt
- AI provider 配置按用户私有保存
- token 只存哈希，不存明文
- 先保证关系清晰和查询稳定，`v1` 不追求过早泛化

## 3. 核心实体关系

核心关系如下：

- 一个 `user` 当前最多绑定一个 `github_accounts`
- 一个 `user` 拥有多条 `sync_runs`
- 一个 `user` 拥有多条 `starred_repos`
- 一条 `starred_repos` 可以关联多条 `repo_tags`
- 一条 `starred_repos` 最多关联一条 `repo_notes`
- 一个 `user` 拥有多条 `personal_api_tokens`
- 一个 `user` 拥有多条 `user_ai_configs`
- 一个 `user` 拥有多条 `ai_usage_logs`
- 一个 `user` 拥有多条 `conversations`，每个会话拥有多条 `chat_messages`

说明：

- `starred_repos` 以“用户视角的仓库快照”建模，而不是做一个全局公共 repo 表
- 这样更适合 `v1`，因为它能直接承载用户专属摘要、同步时间和整理状态

## 4. 表定义

### 4.1 `users`

用途：

- 存应用内用户身份和基础偏好

当前字段：

- `id` `uuid` 主键
- `email` `text` 唯一，可空
- `name` `text`
- `avatar_url` `text`
- `created_at` `timestamptz`
- `updated_at` `timestamptz`
- `last_login_at` `timestamptz`

约束：

- 主键：`id`
- 唯一：`email`，仅当 email 存在时约束唯一

### 4.2 `github_accounts`

用途：

- 存 GitHub OAuth 绑定信息和服务端同步所需凭据元数据

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `github_user_id` `bigint`
- `github_login` `text`
- `access_token_encrypted` `text`
- `refresh_token_encrypted` `text` 可空
- `token_expires_at` `timestamptz` 可空
- `scope` `text`
- `created_at` `timestamptz`
- `updated_at` `timestamptz`
- `last_sync_started_at` `timestamptz` 可空
- `last_sync_finished_at` `timestamptz` 可空
- `last_sync_status` `text` 可空
- `last_sync_error` `text` 可空

约束：

- 主键：`id`
- 外键：`user_id`
- 唯一：`github_user_id`
- 唯一：`user_id`

说明：

- `v1` 默认一个应用用户只绑定一个 GitHub 账号，因此 `user_id` 可以唯一
- 如果以后要支持多 GitHub 身份，可放宽这个唯一约束

### 4.3 `sync_runs`

用途：

- 持久化 GitHub Stars 分页同步的断点、累计统计、错误和最近历史

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `status` `text`，取值为 `running`、`success` 或 `error`
- `started_at` / `finished_at` `timestamptz`
- `next_page` / `page_count` `integer`
- `fetched` / `inserted_or_updated` / `unstarred` / `failed_count` `integer`
- `error_summary` / `error_level` `text` 可空
- `created_at` / `updated_at` `timestamptz`

约束与索引：

- 主键：`id`
- 外键：`user_id`
- 索引：`(user_id, status)`，用于恢复未完成任务
- 索引：`(user_id, started_at)`，用于读取最近同步历史

说明：

- 一次 HTTP 请求最多处理一页；`next_page` 在页成功写入后前进，因此刷新页面、实例重启或可恢复错误重试都能继续同一个任务。
- 只有最后一页成功时才会收敛已取消的 GitHub Star，避免中断时误标记本地记录。

### 4.4 `starred_repos`

用途：

- 存用户 star 过仓库的主记录，也是搜索主表

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `github_repo_id` `bigint`
- `name` `text`
- `full_name` `text`
- `owner_login` `text`
- `owner_avatar_url` `text`
- `html_url` `text`
- `description` `text`
- `topics` `jsonb`
- `language` `text`
- `stargazers_count` `integer`
- `forks_count` `integer`
- `watchers_count` `integer`
- `open_issues_count` `integer`
- `default_branch` `text`
- `homepage` `text`
- `license_key` `text` 可空
- `license_name` `text` 可空
- `archived` `boolean`
- `disabled` `boolean`
- `is_fork` `boolean`
- `is_private` `boolean`
- `visibility` `text`
- `created_at_github` `timestamptz`
- `updated_at_github` `timestamptz`
- `pushed_at_github` `timestamptz`
- `starred_at_github` `timestamptz`
- `repo_summary` `text`
- `readme_excerpt` `text`
- `search_document` `text`
- `ai_summary` `text` 可空
- `is_favorite` `boolean`
- `is_starred` `boolean`
- `unstarred_at` `timestamptz` 可空
- `last_synced_at` `timestamptz`
- `readme_last_processed_at` `timestamptz` 可空
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

约束：

- 主键：`id`
- 外键：`user_id`
- 唯一：`(user_id, github_repo_id)`

说明：

- `topics` 用 `jsonb`，方便保留 GitHub 原始结构并做轻量过滤
- `search_document` 作为数据库搜索输入文本
- `repo_summary` 优先给 UI 和 AI 使用

### 4.5 `repo_tags`

用途：

- 存用户给 starred repo 打的标签

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `starred_repo_id` `uuid` 外键 -> `starred_repos.id`
- `tag` `text`
- `created_at` `timestamptz`

约束：

- 主键：`id`
- 外键：`user_id`
- 外键：`starred_repo_id`
- 唯一：`(starred_repo_id, tag)`

说明：

- `user_id` 冗余保留，便于审计和用户维度查询
- 实现时应保证 `repo_tags.user_id = starred_repos.user_id`

### 4.6 `repo_notes`

用途：

- 存用户对某个 starred repo 的备注

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `starred_repo_id` `uuid` 外键 -> `starred_repos.id`
- `note` `text`
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

约束：

- 主键：`id`
- 外键：`user_id`
- 外键：`starred_repo_id`
- 唯一：`starred_repo_id`

说明：

- `v1` 一个仓库只保留一条当前备注，不做备注历史

### 4.7 `personal_api_tokens`

用途：

- 存 CLI / agent 用的访问 token

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `name` `text`
- `note` `text`
- `token_hash` `text`
- `token_prefix` `text`
- `token_suffix` `text`
- `last_used_at` `timestamptz` 可空
- `revoked_at` `timestamptz` 可空
- `expires_at` `timestamptz` 可空
- `created_at` `timestamptz`

约束：

- 主键：`id`
- 外键：`user_id`
- 唯一：`token_hash`

说明：

- 明文 token 只在创建时返回一次，不入库
- `token_prefix` 和 `token_suffix` 用于 UI 上识别和审计
- 当前没有持久化 scope 字段；Token 是用户级粗粒度凭据

### 4.8 `user_ai_configs`

用途：

- 存用户自己的 AI provider 配置

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `display_name` `text`
- `provider_type` `text`
- `model` `text`
- `base_url` `text` 可空
- `api_key_encrypted` `text` 可空
- `extra_headers_encrypted` `text` 可空
- `enabled` `boolean`
- `is_default` `boolean`
- `last_validated_at` `timestamptz` 可空
- `last_validation_status` `text` 可空
- `last_validation_error` `text` 可空
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

约束：

- 主键：`id`
- 外键：`user_id`

说明：

- `provider_type` 允许值：
  - `openai_compatible`
  - `anthropic_native`
  - `gemini_native`
  - `deepseek_native`
- `v1` 需要在应用层保证同一用户最多只有一条 `is_default = true`

### 4.9 `ai_usage_logs`

用于记录每次 AI 调用的用量，供后续限流/计费/排查参考。

字段：

- `id` `uuid`
- `user_id` `uuid`（外键 → `users.id`，级联删除）
- `endpoint` `text`（调用的 AI 能力接口，如 `ai/ask`）
- `model` `text`
- `prompt_tokens` `integer`，默认 `0`
- `completion_tokens` `integer`，默认 `0`
- `created_at` `timestamptz`

索引：

- `user_id`
- `created_at`

说明：

- 只记录用量统计，不存储 prompt/completion 原文，不是完整的调用审计日志

### 4.10 `conversations`

用于保存多轮 AI 会话元数据和压缩摘要。

当前字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `title` `text`
- `last_question` `text` 可空
- `summary` `text` 可空
- `summarized_up_to` `uuid` 可空
- `created_at` / `updated_at` `timestamptz`

索引：

- `user_id`
- `(user_id, updated_at)`

### 4.11 `chat_messages`

用于保存会话中的 user / assistant 消息和 assistant 候选仓库。

当前字段：

- `id` `uuid` 主键
- `conversation_id` `uuid` 外键 -> `conversations.id`，级联删除
- `user_id` `uuid` 外键 -> `users.id`，级联删除
- `role` `text`（当前取 `user` 或 `assistant`）
- `content` `text`
- `candidates` `jsonb`，默认空数组
- `created_at` / `updated_at` `timestamptz`

索引：

- `conversation_id`

## 5. 索引策略

### 5.1 搜索与列表查询

`starred_repos` 当前索引：

- `btree (user_id)`
- `btree (user_id, owner_login)`
- `btree (user_id, language)`
- `btree (user_id, is_favorite)`

全文搜索索引：

- `GIN (to_tsvector('simple', search_document))`

说明：

- 如果要支持中文备注搜索，可在后续迭代中评估更合适的文本检索配置
- `v1` 先以英文与代码仓库检索为主，使用简单配置即可起步

### 5.2 标签和备注

- `repo_tags (user_id, tag)`
- `repo_tags` 唯一约束 `(starred_repo_id, tag)`
- `repo_notes` 唯一约束 `(starred_repo_id)`

### 5.3 配置与 token

- `personal_api_tokens (user_id, revoked_at)`
- `user_ai_configs (user_id, enabled)`
- `user_ai_configs (user_id, is_default)`
- `ai_usage_logs (user_id)`
- `ai_usage_logs (created_at)`
- `conversations (user_id)`
- `conversations (user_id, updated_at)`
- `chat_messages (conversation_id)`

## 6. 同步与更新规则

### 6.1 GitHub 同步

同步 `GET /user/starred` 时：

- 以 `(user_id, github_repo_id)` 做 upsert
- 覆盖 GitHub 原生字段
- 保留用户私有字段：
  - `is_favorite`
  - `repo_tags`
  - `repo_notes`
  - `ai_summary`

### 6.2 README 处理

- README 不全文入库
- 同步后按策略提取 `repo_summary` 和 `readme_excerpt`
- 当仓库 `pushed_at_github` 变化时，可重新处理 README 摘要

### 6.3 搜索文档更新

`search_document` 应由以下字段重新拼接生成：

- `full_name`
- `owner_login`
- `description`
- `topics`
- `repo_summary`
- `repo_notes.note`
- `repo_tags.tag`

说明：

- 标签或备注变化后，需要重新刷新对应仓库的 `search_document`

## 7. 与 API 和 UI 的关系

### 主列表直接依赖

- `full_name`
- `owner_login`
- `repo_summary`
- `description`
- `stargazers_count`
- `language`
- `pushed_at_github`
- `is_favorite`

### 右侧详情依赖

- `html_url`
- `topics`
- `license_name`
- `default_branch`
- `forks_count`
- `open_issues_count`
- `readme_excerpt`
- `repo_notes.note`
- `repo_tags.tag`
- `ai_summary`
- `is_starred`
- `unstarred_at`

### 设置页依赖

- `user_ai_configs`
- `personal_api_tokens`

### AI 对话依赖

- `conversations`
- `chat_messages`

## 8. v1 明确不做

- 全局公共 `repositories` 维表和用户关系表拆分
- README 全文表
- embeddings / vector 表
- Token 细粒度权限矩阵表
- repo note 历史版本表

这些都可以在后续版本基于当前 schema 再拆分。

## 9. 当前默认决策

- 数据库使用 PostgreSQL
- 主搜索表为 `starred_repos`
- 仓库记录按用户视角存储，不先做全局 repo 归并
- README 只保留摘要与 excerpt
- tags 为多行表结构，不塞入数组字段
- note 为单独一表，一仓库一备注
- token 只存哈希
- AI provider 配置按用户私有保存
- AI 对话历史按用户和会话隔离，删除会话时级联删除消息
