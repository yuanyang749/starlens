# Starlens 数据库结构草案

## 1. 文档目标

这份文档用于把 Starlens `v1` 的 PostgreSQL 数据结构收束成实现可用的数据库草案，明确：

- 核心表及其职责
- 关键字段
- 主键、唯一约束与外键关系
- 搜索、同步和配置场景需要的索引
- `v1` 明确做和不做的边界

这是一份偏工程落地的 schema 说明，优先服务后续迁移设计、ORM 建模和 API 实现。

## 2. 设计原则

- 以“个人优先，但可开源扩展”为前提，所有核心数据都按多用户建模
- GitHub 原生数据与用户私有整理数据分离
- README 不存全文，只存摘要和 excerpt
- AI provider 配置按用户私有保存
- token 只存哈希，不存明文
- 先保证关系清晰和查询稳定，`v1` 不追求过早泛化

## 3. 核心实体关系

核心关系如下：

- 一个 `user` 绑定一个或多个 `github_accounts`
- 一个 `user` 拥有多条 `starred_repos`
- 一条 `starred_repos` 可以关联多条 `repo_tags`
- 一条 `starred_repos` 最多关联一条 `repo_notes`
- 一个 `user` 拥有多条 `personal_api_tokens`
- 一个 `user` 拥有多条 `user_ai_configs`

说明：

- `starred_repos` 以“用户视角的仓库快照”建模，而不是做一个全局公共 repo 表
- 这样更适合 `v1`，因为它能直接承载用户专属摘要、同步时间和整理状态

## 4. 表定义

### 4.1 `users`

用途：

- 存应用内用户身份和基础偏好

建议字段：

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

建议字段：

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

### 4.3 `starred_repos`

用途：

- 存用户 star 过仓库的主记录，也是搜索主表

建议字段：

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

### 4.4 `repo_tags`

用途：

- 存用户给 starred repo 打的标签

建议字段：

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

### 4.5 `repo_notes`

用途：

- 存用户对某个 starred repo 的备注

建议字段：

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

### 4.6 `personal_api_tokens`

用途：

- 存 CLI / agent 用的访问 token

建议字段：

- `id` `uuid` 主键
- `user_id` `uuid` 外键 -> `users.id`
- `name` `text`
- `token_hash` `text`
- `token_prefix` `text`
- `scope` `jsonb`
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
- `token_prefix` 用于 UI 上识别和审计

### 4.7 `user_ai_configs`

用途：

- 存用户自己的 AI provider 配置

建议字段：

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
- `v1` 需要在应用层保证同一用户最多只有一条 `is_default = true`

## 5. 索引策略

### 5.1 搜索与列表查询

为 `starred_repos` 建议至少创建：

- `btree (user_id, is_favorite, pushed_at_github desc)`
- `btree (user_id, owner_login)`
- `btree (user_id, language)`
- `btree (user_id, starred_at_github desc)`
- `btree (user_id, updated_at)`

全文搜索建议：

- `GIN (to_tsvector('simple', search_document))`

说明：

- 如果要支持中文备注搜索，可在后续迭代中评估更合适的文本检索配置
- `v1` 先以英文与代码仓库检索为主，使用简单配置即可起步

### 5.2 标签和备注

- `repo_tags (user_id, tag)`
- `repo_tags (starred_repo_id)`
- `repo_notes (starred_repo_id)`

### 5.3 配置与 token

- `personal_api_tokens (user_id, revoked_at)`
- `user_ai_configs (user_id, enabled)`
- `user_ai_configs (user_id, is_default)`

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

### 设置页依赖

- `user_ai_configs`
- `personal_api_tokens`

## 8. v1 明确不做

- 全局公共 `repositories` 维表和用户关系表拆分
- README 全文表
- embeddings / vector 表
- AI 调用日志表
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
