# Starlens 同步流程设计文档

## 1. 文档目标

这份文档用于定义 Starlens `v1` 的同步流程，明确：

- GitHub starred 仓库如何拉取
- 哪些数据在同步阶段写入数据库
- README 摘要如何提取
- `search_document` 如何构建与刷新
- 手动同步和定时同步的行为差异

它是数据库结构、API 契约和前端状态展示之间的桥梁。

## 2. 同步目标

同步流程需要完成四件事：

1. 拉取用户当前的 starred repos 列表
2. 更新本地仓库快照数据
3. 提取轻量摘要信息
4. 维护搜索所需的 `search_document`

`v1` 的同步目标不是镜像 GitHub 全量仓库内容，而是让用户能够稳定、快速地找回曾经 star 过的仓库。

## 3. 数据来源

### 3.1 主数据源

主数据源为：

- `GET /user/starred`

要求：

- 使用可返回 `starred_at` 的媒体类型
- 分页拉取全部 starred repos

主数据用于填充：

- GitHub 原生仓库字段
- `starred_at_github`
- 增量更新判断基础

### 3.2 补充数据源

补充数据源仅在需要时调用：

- `GET /repos/{owner}/{repo}/readme`
  - 用于提取 `repo_summary` 和 `readme_excerpt`
- `GET /repos/{owner}/{repo}/languages`
  - `v1` 可选，不作为主流程阻塞步骤

## 4. 同步类型

### 4.1 首次同步

触发时机：

- 用户首次完成 GitHub 登录并进入工作台
- 本地没有任何 `starred_repos` 数据

行为：

- 拉取全部 starred repos
- 为每个仓库写入本地快照
- 生成初始 `repo_summary`、`readme_excerpt`、`search_document`

目标：

- 让用户首次进入工作台时即可搜索和浏览完整数据

### 4.2 手动同步

触发时机：

- 用户点击工作台中的同步按钮
- CLI 或 agent 通过 `POST /api/sync` 主动触发

行为：

- 重新拉取当前全部 starred repos 列表
- 对已有仓库做 upsert
- 识别新增仓库与已变化仓库
- 更新必要的摘要和搜索文档

### 4.3 定时同步

触发时机：

- 平台定时任务按默认“每隔一天”执行一次

行为：

- 与手动同步逻辑一致
- 但 UI 不需要等待其完成

目标：

- 让低频使用场景下的数据保持大致新鲜

## 5. 主同步流程

### 5.1 流程概览

推荐主流程如下：

1. 记录同步开始状态
2. 分页拉取 GitHub starred repos
3. 标准化 GitHub 返回结构
4. 对 `starred_repos` 执行 upsert
5. 标记需要重新处理 README 的仓库
6. 提取 `repo_summary` 和 `readme_excerpt`
7. 重建 `search_document`
8. 记录同步结束状态

### 5.2 同步开始

同步开始时需要更新：

- `github_accounts.last_sync_started_at`
- `github_accounts.last_sync_status = running`
- 清空旧的 `last_sync_error`

同时建议防止同一用户重复并发触发多个同步任务。

### 5.3 拉取 starred repos

分页策略：

- 按 GitHub 默认分页或显式 `per_page`
- 循环拉取直到没有更多数据

对每条仓库记录做标准化：

- 保留计划文档中已经确定的 GitHub 原生字段
- 丢弃 `v1` 暂时不用的重量字段

### 5.4 仓库 upsert

唯一键：

- `(user_id, github_repo_id)`

更新策略：

- GitHub 原生字段全部以最新返回值覆盖
- 用户私有字段保持不变：
  - `is_favorite`
  - `repo_notes`
  - `repo_tags`
  - `ai_summary`

### 5.5 仓库消失处理

当某个本地仓库在最新 GitHub starred 列表中不存在时，说明用户可能已取消 star。

`v1` 建议策略：

- 从 `starred_repos` 中软删除或硬删除二选一

当前默认决策建议：

- **软删除**

建议增加逻辑字段：

- `is_starred` `boolean`
- `unstarred_at` `timestamptz` 可空

原因：

- 可保留用户备注和标签历史
- 更适合后续做“曾经收藏过”的恢复能力

如果 `v1` 为了简化实现不引入软删除字段，则需在后续版本补迁移方案。

## 6. README 摘要处理

### 6.1 处理目标

README 处理只做轻量增强，不做全文入库。

输出结果：

- `repo_summary`
- `readme_excerpt`

### 6.2 处理时机

首次同步时：

- 所有新仓库都处理

增量同步时：

- 新仓库处理
- `pushed_at_github` 变化的仓库重新处理

### 6.3 处理方式

推荐步骤：

1. 拉取 README
2. 解码正文
3. 去掉多余 markdown 噪音
4. 提取开头最有信息量的段落作为 `readme_excerpt`
5. 结合 `description + topics + excerpt` 生成 `repo_summary`

### 6.4 `repo_summary` 生成策略

`v1` 默认推荐优先级：

1. 如果 `description` 已经足够清晰，直接做轻微清洗
2. 如果 `description` 太短或太弱，再结合 README 前几段补强
3. 可选使用 AI 生成一条更自然的 summary，但不应阻塞主同步流程

默认建议：

- `v1` 主同步先不依赖 AI 来生成 `repo_summary`
- 优先做规则提取或轻量摘要
- AI 摘要单独作为 `ai_summary` 能力存在

## 7. `search_document` 构建

### 7.1 构建目标

`search_document` 用于 PostgreSQL 全文检索，是搜索主输入文本。

### 7.2 拼接来源

建议拼接以下字段：

- `full_name`
- `owner_login`
- `description`
- `topics`
- `repo_summary`
- `repo_notes.note`
- `repo_tags.tag`

### 7.3 刷新时机

以下任一变化后都应刷新：

- GitHub 仓库元数据更新
- README 摘要更新
- 标签新增 / 删除
- 备注更新

### 7.4 不纳入的内容

`v1` 不纳入：

- README 全文
- AI 多轮问答输出
- 大段 issue / PR 内容

## 8. 错误处理与重试

### 8.1 GitHub API 错误

需要明确区分：

- token 失效
- 权限不足
- API rate limit
- 网络错误

行为建议：

- 当前同步标记失败
- 记录 `github_accounts.last_sync_error`
- 不清空旧的可搜索数据

### 8.2 README 获取失败

README 拉取失败不应导致整次同步失败。

行为建议：

- 仓库主记录照常写入
- `repo_summary` 回退到 `description`
- `readme_excerpt` 允许为空

### 8.3 部分仓库处理失败

若部分仓库摘要提取失败：

- 不回滚整批同步
- 按仓库粒度记录失败日志
- 允许后续手动同步再次修复

## 9. 前端状态影响

工作台至少需要感知以下同步状态：

- 从未同步
- 同步中
- 同步成功
- 同步失败

UI 需要展示：

- 最近同步时间
- 当前同步状态
- 错误提示

但 `v1` 不要求做复杂进度条或任务监控面板。

## 10. 与 API 的关系

### `POST /api/sync`

职责：

- 触发同步任务
- 返回任务已开始的状态

### `GET /api/search`

依赖：

- `search_document`
- 已同步的 `starred_repos`

### `GET /api/repos/:id`

依赖：

- 同步后的 GitHub 原生字段
- `repo_summary`
- `readme_excerpt`
- 用户标签和备注

## 11. 当前默认决策

- 主数据源为 GitHub `GET /user/starred`
- README 只做轻量摘要，不做全文入库
- `repo_summary` 不强依赖 AI
- `search_document` 由 GitHub 字段 + 用户整理字段拼接生成
- 手动同步与定时同步复用同一套核心逻辑
- README 获取失败不阻塞主同步成功

