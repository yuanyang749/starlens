# Starlens 主动型 Agent 集成设计

> **状态：2026-07-04 的实现规格快照。** Skill 目录和 CLI 安装流程随后已迁移到 `skills/starlens/`、`npx skills add`、`stars setup`；当前接入方式以 `docs/agent-integration.md` 为准。下文的旧路径保留用于解释当时的迁移背景。

## 1. 文档目标

定义 Starlens 从"被动响应型 agent 工具集"向"主动型 agent 集成体验"演进的设计方案。让 Hermes、Codex、Claude Code、Cursor、opencode 等 AI agent 在合适的场景下**主动调用** Starlens，而非等用户显式指示。

本设计不突破 v1 约束：
- 不做多用户协作
- 不做向量检索 / embeddings / 全 RAG
- 不做 webhook push 推送（同步后报告采用 pull-based）
- 不做任意 HTTP 请求结构的万能 AI 适配器

## 2. 背景与现状

### 2.1 当前 agent 集成现状

- 9 个 agent tools：`search_stars`、`show_star`、`sync_stars`、`favorite_star`、`unfavorite_star`、`set_star_note`、`add_star_tag`、`remove_star_tag`、`ask_stars`
- 工具定义在 [packages/agent-tools/src/index.ts](../../../packages/agent-tools/src/index.ts)
- 当时的 SKILL.md 位于 `agent-skills/starlens/SKILL.md`，并与 `apps/cli/skills/starlens/SKILL.md` 双写
- 当时的 HTTP API 文档位于 `agent-skills/starlens/references/http-api.md`

### 2.2 当前问题

1. SKILL.md description 被动语态（"needs to search"），描述的是 agent 已决定要做某事时才用，而非触发 agent 主动想到用
2. 功能列表式描述，agent 难以从中推断"何时该主动调用"
3. 缺少 4 个目标场景（编码参考、整理维护、问答引用、同步报告）的触发词
4. 缺少反例（何时不该调用）
5. 工具返回值是纯 JSON 数据，缺少引导 agent 继续推理的提示
6. 同步后无变化摘要能力，agent 无法回答"最近有什么新"

## 3. 目标场景

5 个场景，对应 5 个新工具：

| 场景 | 触发条件 | 推荐工具 | 数据来源 |
|---|---|---|---|
| 1. 编码任务参考 | 用户开始编码任务（写新功能、选型、调研） | `recommend_for_task` | starred_repos + AI 重排 |
| 2. 问答增强引用 | 用户问技术问题（库选型、工具对比） | `search_stars` / `ask_stars`（现有） | starred_repos |
| 3. 知识整理维护 | 用户提到整理、清理、归类、重复、过时、没标签 | `suggest_organization` | starred_repos 聚合 |
| 4. 同步后报告 | 新会话、用户问"最近变化"、"上次同步后变了什么" | `get_sync_summary` | sync 差异（持久化） |
| 5. 仓库分析+智能标注 | 用户丢一个仓库让分析 | `analyze_repo` | 已 star 用本地数据，未 star 实时拉 GitHub |

场景 2 复用现有工具，不需要新工具。本设计新增 5 个工具覆盖场景 1、3、4、5。

## 4. 整体架构

4 层结构，每层独立可验证：

```text
┌─────────────────────────────────────────────────────────┐
│ 第 4 层：跨 agent 兼容层                                  │
│  - Hermes/OpenClaw (HTTP+Skill) 专属触发描述             │
│  - Codex/Claude Code (MCP+Skill) 双通道描述              │
│  - Cursor/opencode (MCP) 工具描述优化                    │
│  - 隐私边界说明                                           │
├─────────────────────────────────────────────────────────┤
│ 第 3 层：结构化反馈层                                    │
│  - 工具返回值从纯 JSON → "数据 + 推理提示"               │
│  - suggestedNextActions / reasoningHints / meta          │
├─────────────────────────────────────────────────────────┤
│ 第 2 层：主动型工具能力层（5 个新工具 + 5 个新 API）      │
│  - recommend_for_task  - find_related                   │
│  - suggest_organization - get_sync_summary              │
│  - analyze_repo                                           │
├─────────────────────────────────────────────────────────┤
│ 第 1 层：Skill 触发描述层                                │
│  - 重写 SKILL.md：从"如何调用"→"何时主动调用"            │
│  - 5 个场景的 trigger 关键词 + 反例（何时不该调用）       │
└─────────────────────────────────────────────────────────┘
```

### 4.1 模块边界与改动范围

| 层 | 改动位置 | 是否新增后端接口 |
|---|---|---|
| 第 1 层 | `agent-skills/starlens/SKILL.md` + `apps/cli/skills/starlens/SKILL.md` + `references/http-api.md` | 否 |
| 第 2 层 | `packages/agent-tools/src/index.ts`（工具定义）+ `packages/server/src/routes/` 新增 5 个路由 + `packages/server/src/server/` 新增业务逻辑 | 是 |
| 第 3 层 | `packages/agent-tools/src/index.ts`（返回值结构）+ `packages/core/src/types.ts`（类型） | 否（仅结构约定） |
| 第 4 层 | `agent-skills/starlens/SKILL.md` 中新增 "Integration Modes" 与 "Privacy" 节 | 否 |

### 4.2 关键设计原则

1. **不突破 v1 约束**：不做多用户协作、向量检索、webhook push
2. **等价优先**：第 1 层和第 3 层不改变现有工具行为，只优化描述和返回值结构。第 2 层新增工具是纯增量，不影响现有 9 个工具
3. **工具描述即触发器**：对于 MCP-based agent，工具的 `description` 字段是 agent 决定"是否主动调用"的主要依据，新工具的 description 要写得像"触发条件"而非"功能说明"
4. **SKILL.md 双写**：`agent-skills/starlens/` 和 `apps/cli/skills/starlens/` 两处保持同步
   - 后续更新：手动双写已改为 `scripts/sync-skill.mjs` 自动生成；当前 `skills/starlens/` 是唯一手写源，`apps/cli/skills/starlens/` 是构建产物（已加入 `.gitignore`），在 `apps/cli` 的 `prepack`/`pretest` 和仓库根 `postinstall` 时自动同步。
5. **GitHub API 能力足够**：5 个工具不需要新的 GitHub API 能力，都是基于已有数据或已有 sync 链路的增量

## 5. 第 1 层：Skill 触发描述层

### 5.1 重写后的 frontmatter description

```yaml
description: >-
  Proactively use StarLens as the user's personal memory of GitHub starred
  repositories. Trigger this skill when ANY of these contexts appear in the
  user's task: (1) the user is starting a coding task — before writing code,
  search StarLens for related libraries, frameworks, or prior art the user
  has already starred; (2) the user asks a technical question about libraries,
  tools, or frameworks — cite their starred repos as evidence or
  recommendations; (3) the user mentions organizing, cleaning up, or
  reviewing their starred collection — suggest duplicates, stale repos,
  untagged high-star repos, or tag groupings; (4) the user starts a new
  session or asks "what's new" — call get_sync_summary to report recently
  added/removed/changed stars since their last visit; (5) the user drops a
  repository for analysis — call analyze_repo to surface what the repo is
  good for and suggest tags/notes. Also trigger when the user explicitly
  names a repository, topic, owner, or technology that may exist in their
  starred collection. Do NOT trigger for tasks unrelated to software
  development, library selection, or repository curation.
```

### 5.2 SKILL.md 正文结构调整

调整为 **场景优先** 结构：

```markdown
# StarLens

## Purpose
（保留，简短）

## When to Proactively Use This Skill

### Scenario 1: Coding Task Reference
触发条件：用户开始一个编码任务（写新功能、选型、调研技术方案）。
推荐调用：`recommend_for_task` 优先；若已有具体仓库名 → `find_related`。

### Scenario 2: Answer Enhancement
触发条件：用户问"X 库怎么样"、"有没有好的 Y 工具"、"Z 和 W 哪个好"。
推荐调用：先 `search_stars`，若无精确命中 → `ask_stars`。

### Scenario 3: Knowledge Maintenance
触发条件：用户提到"整理"、"清理"、"归类"、"重复"、"过时"、"没标签"。
推荐调用：`suggest_organization`（返回重复/过时/未分类建议）。

### Scenario 4: Sync Status & Changes
触发条件：新会话开始、用户问"最近有什么新"、"上次同步后变了什么"。
推荐调用：`get_sync_summary`（pull-based，返回最近同步变化摘要）。

### Scenario 5: Repo Analysis & Smart Tagging
触发条件：用户丢一个仓库（owner/repo）让分析，或问"这个仓库适合做什么"。
推荐调用：`analyze_repo`（返回适用场景、建议标签、建议备注）。
应用建议：agent 先呈现建议给用户，用户确认后再调用 `add_star_tag` / `set_star_note` 应用。

## When NOT to Use This Skill
- 与软件开发、库选型、仓库整理无关的任务
- 用户明确说不需要参考 starred repos

## Required Configuration
（保留）

## Integration Modes
- Hermes/OpenClaw：HTTP + Skill，环境变量 STARLENS_API_BASE_URL + STARLENS_TOKEN
- Codex/Claude Code：MCP（已配置时优先）或 HTTP + Skill
- Cursor/opencode：MCP，工具 description 即触发器

## Workflow
（保留，补充：优先按场景触发，而非等用户显式指示）

## Behavior Rules
（保留，补充：主动调用时向用户说明"我从你的 StarLens 收藏中找到了..."）

## Privacy
- 主动调用的结果不得写入 agent 的长期记忆或外部日志
- 不得在跨用户场景共享 StarLens 数据
- analyze_repo 对未 star 仓库的实时拉取结果不持久化

## Common Examples
（补充 5 个场景对应的主动调用示例）
```

### 5.3 验收标准

- description 包含 5 个场景的明确触发词
- 正文有 "When to Proactively Use" 和 "When NOT to Use" 两节
- 5 个场景各有"触发条件 + 推荐调用"说明
- 两处 SKILL.md 完全一致
- Common Examples 至少覆盖 5 个场景各 1 条

## 6. 第 2 层：主动型工具能力层

### 6.1 5 个新工具的职责定义

#### 6.1.1 `recommend_for_task`
- **输入**：`taskDescription`（任务描述，必填）、`limit`（默认 10，最大 30）
- **行为**：基于任务描述，从 starred_repos 中召回相关仓库（先全文检索 + AI 重排）
- **返回**：相关仓库列表 + 每个仓库的"为什么相关"解释
- **冷启动**：用户未同步时返回 `{ empty: true, hint: "请先调用 sync_stars 同步" }`

#### 6.1.2 `find_related`
- **输入**：`repo`（仓库名或 id，必填）、`limit`（默认 10）
- **行为**：给定一个仓库，从用户的 starred_repos 中找出相关的（同 owner、同 topic、同语言、AI 语义相似）
- **返回**：相关仓库列表 + 关联原因

#### 6.1.3 `suggest_organization`
- **输入**：`focus`（可选：`duplicates` / `stale` / `untagged` / `all`，默认 `all`）
- **行为**：扫描 starred_repos，找出：
  - 重复：同 owner+name（理论上不应出现，但 GitHub 数据可能重复）
  - 过时：`pushed_at` 超 2 年
  - 未分类：`user_tags` 为空且 `stargazers_count` 高（默认 >1000）
  - 标签分组建议：基于现有标签的聚类
- **返回**：分类建议列表，每项含 `repoId`、`issue`、`suggestion`
- **不自动修改**：只返回建议，由 agent 引导用户逐项确认后调用 `add_star_tag` 等工具应用

#### 6.1.4 `get_sync_summary`
- **输入**：`since`（可选 ISO 时间戳，默认上次同步时间）
- **行为**：返回最近一次同步的新增/消失/变化仓库摘要
- **返回**：`lastSyncAt`、`added[]`、`removed[]`、`changed[]`、`totalCount`

#### 6.1.5 `analyze_repo`
- **输入**：`repo`（owner/repo 或 id，必填）、`applySuggestions`（bool，默认 false）
- **行为**：
  - 已 star：用本地 `starred_repos` 数据（含 `repo_summary`、`readme_excerpt`、topics）
  - 未 star：实时调 GitHub API `GET /repos/{owner}/{repo}` + `GET /repos/{owner}/{repo}/readme`，提取摘要
  - 调用 AI 生成：适用场景、建议标签、建议备注
  - `applySuggestions=true` 时自动应用标签和备注（仅对已 star 仓库有效；未 star 仓库返回 `applied: false` 并提示先 star）
- **返回**：`repo`（基础信息）、`summary`、`suitableFor`、`suggestedTags[]`、`suggestedNote`、`isStarred`、`applied`

### 6.2 与现有工具的关系

- `analyze_repo` 是 `show_star` 的增强版：`show_star` 返回原始数据，`analyze_repo` 返回数据 + AI 分析 + 建议
- `recommend_for_task` 是 `search_stars` + AI 重排的任务化封装
- `find_related` 是 `search_stars` 的语义关联版本
- 现有 9 个工具保持不变，5 个新工具是纯增量

### 6.3 边界与约束

1. **未 star 仓库的 `analyze_repo` 不写入数据库**：只做实时分析，结果返回给 agent。若要保存标签/备注，必须先 star
2. **`applySuggestions` 默认 false**：agent 需先呈现建议给用户，用户确认后再调用一次 `applySuggestions=true`，避免擅自修改用户数据
3. **`suggest_organization` 不自动修改**：只返回建议，由 agent 引导用户逐项确认后调用 `add_star_tag` 等工具应用
4. **`get_sync_summary` 的差异持久化**：需要在 sync 流程中记录前后快照（新增 `sync_changes` 表）

### 6.4 HTTP API 端点

| 工具 | HTTP 端点 | 复用现有模块 |
|---|---|---|
| `recommend_for_task` | `POST /api/ai/recommend` | 复用 `ai/ask/` 下 agent/loop/provider，换 prompt |
| `find_related` | `POST /api/ai/related` | 复用 search + AI 重排 |
| `suggest_organization` | `GET /api/repos/suggestions` | 纯 DB 聚合，无 AI |
| `get_sync_summary` | `GET /api/sync/summary` | 复用 sync 流程 + sync_changes 表 |
| `analyze_repo` | `POST /api/ai/analyze` | 已 star 用本地数据；未 star 调用 github/client.ts |

路由文件位置遵循现有约定：`packages/server/src/routes/<path>/route.ts`，Web/Mobile 通过薄路由转发。

### 6.5 CLI 对称能力

新增两个 CLI 命令（在 `apps/cli/src/commands.mjs` 和 `renderers.mjs`）：

- `stars suggest [--focus duplicates|stale|untagged|all]` — 调用 `GET /api/repos/suggestions`，表格化输出
- `stars analyze <repo> [--apply]` — 调用 `POST /api/ai/analyze`，呈现分析结果，`--apply` 时应用建议

## 7. 第 3 层：结构化反馈层

### 7.1 工具返回值结构

工具返回值从纯 JSON 数据升级为：

```json
{
  "data": { ... },
  "meta": {
    "rateLimit": { "remaining": 18, "resetAt": "2026-07-04T10:00:00Z" },
    "empty": false
  },
  "suggestedNextActions": [
    { "tool": "add_star_tag", "args": { "repo": "owner/repo", "tag": "rag" }, "reason": "该仓库适合 RAG 场景" }
  ],
  "reasoningHints": "基于任务描述中'memory'关键词，匹配到 3 个相关仓库"
}
```

### 7.2 字段说明

- `data`：原有工具返回的数据，结构不变，保证向后兼容
- `meta.rateLimit`：限流信息，复用 `packages/server/src/server/ai/rate-limit.ts`，让 agent 知道何时收敛调用频率
- `meta.empty`：冷启动标志，用户未同步时为 true，agent 应引导用户先 `sync_stars`
- `suggestedNextActions`：agent 可直接调用的下一步工具+参数，适用于 `analyze_repo`、`recommend_for_task` 等需要后续动作的场景
- `reasoningHints`：让 agent 理解为什么返回这些结果，便于向用户解释

### 7.3 向后兼容

现有 9 个工具的返回值保持纯 JSON（不强制升级为新结构），新工具默认使用新结构。`callAgentTool` 的返回类型 `AgentToolResult` 不变（仍是 `{ content: [{ type: "text", text: string }] }`），新结构作为 `text` 字段的 JSON 序列化内容。

## 8. 第 4 层：跨 agent 兼容层

### 8.1 不维护多份 SKILL.md

在 SKILL.md 中用条件化描述覆盖三类 agent：

| Agent 类型 | 调用通道 | SKILL.md 中的特殊说明 |
|---|---|---|
| Hermes/OpenClaw | HTTP + Skill | 强调环境变量 `STARLENS_API_BASE_URL` + `STARLENS_TOKEN`；不提 MCP |
| Codex/Claude Code | MCP + Skill | 说明可走 MCP 也可走 HTTP；优先 MCP（已配置时） |
| Cursor/opencode | MCP | 工具描述即触发器，依赖 `agentTools` 的 description 字段 |

在 SKILL.md 顶部增加 "Integration Modes" 一节，列出三类 agent 的推荐通道。CLI 的 `install-skill` 向导已支持按 agent 类型分发配置，本次复用。

### 8.2 工具描述优化

5 个新工具的 `description` 字段采用"触发条件"写法而非"功能说明"写法。例：

```text
"Call this tool when the user starts a coding task (new feature, tech selection,
research) and you want to find relevant libraries or prior art from their
GitHub starred repos before writing code."
```

而非：

```text
"Recommend starred repositories for a given task description."
```

### 8.3 隐私边界（写入 SKILL.md 的 Behavior Rules + Privacy 节）

补充：
- 主动调用的结果不得写入 agent 的长期记忆或外部日志
- 不得在跨用户场景共享 StarLens 数据
- `analyze_repo` 对未 star 仓库的实时拉取结果不持久化

## 9. 数据层改动

### 9.1 新增 `sync_changes` 表（支持 `get_sync_summary`）

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `user_id` | uuid | 用户 id |
| `sync_run_id` | uuid | 同步运行 id（同一次 sync 产生的多条记录共享） |
| `change_type` | enum | `added` / `removed` / `changed` |
| `repo_full_name` | text | 仓库全名 owner/repo |
| `payload` | jsonb | 变化详情（如字段前后值） |
| `detected_at` | timestamptz | 检测时间 |

在 `packages/server/src/server/github/sync.ts` 中，对比前后快照写入差异。通过 drizzle 迁移生成（0007_snapshot）。

### 9.2 限流计数器复用

不新建表，`packages/server/src/server/ai/rate-limit.ts` 已有进程内计数。在工具返回值的 body 中增加 `meta.rateLimit` 字段（`remaining`、`resetAt`）。

### 9.3 冷启动检测

工具入口处检查 `starred_repos` 表中该用户是否有记录，无则返回 `{ empty: true, hint: "请先调用 sync_stars 同步" }`。适用于 `recommend_for_task`、`find_related`、`suggest_organization`。`analyze_repo` 不需要冷启动检测（未 star 仓库也能分析）。

## 10. 实施优先级

按方案 A 的 4 层顺序，但第 2 层的 5 个工具按价值排序：

1. **`analyze_repo`**（用户核心诉求，先做）
2. **`recommend_for_task` + `find_related`**（编码参考场景）
3. **`suggest_organization`**（整理维护）
4. **`get_sync_summary`**（需要 sync_changes 表，放最后）

第 1 层（SKILL.md 重写）可与第 2 层并行推进，但需在新工具就绪后才能在 SKILL.md 中引用。

第 3 层（结构化反馈）随第 2 层每个工具一起实现。

第 4 层（跨 agent 兼容）随第 1 层一起完成。

## 11. 远期不纳入

以下能力本轮不做，作为远期：

- 错误降级策略（404/429/5xx 时 agent 的降级行为，当前 SKILL.md 只覆盖 401/429/5xx 基本处理）
- webhook push 推送（同步后真正主动通知 agent，需要 agent 侧实现接收端）
- 向量检索 / embeddings / 全 RAG
- 多用户协作

## 12. 验收标准

### 12.1 第 1 层验收

- SKILL.md description 包含 5 个场景的明确触发词
- 正文有 "When to Proactively Use" 和 "When NOT to Use" 两节
- 5 个场景各有"触发条件 + 推荐调用"说明
- 两处 SKILL.md 完全一致
- Common Examples 至少覆盖 5 个场景各 1 条
- 新增 "Integration Modes" 和 "Privacy" 节

### 12.2 第 2 层验收

- 5 个新工具在 `packages/agent-tools/src/index.ts` 中定义
- 5 个新 API 端点在 `packages/server/src/routes/` 中实现
- Web/Mobile 薄路由转发正常
- `sync_changes` 表迁移成功
- 2 个新 CLI 命令 `stars suggest` 和 `stars analyze` 可用
- 现有 9 个工具行为不变

### 12.3 第 3 层验收

- 5 个新工具返回值包含 `meta`、`suggestedNextActions`、`reasoningHints`（视场景）
- 冷启动场景返回 `meta.empty: true`
- 限流信息透传到 `meta.rateLimit`

### 12.4 第 4 层验收

- SKILL.md 中 "Integration Modes" 覆盖三类 agent
- 5 个新工具的 description 采用"触发条件"写法
- "Privacy" 节明确主动调用结果的隐私边界

### 12.5 回归检查点

至少覆盖以下核心路径：
- 现有 9 个工具调用行为不变
- 页面首次打开、搜索、详情、收藏、备注、标签、同步、AI 搜索
- CLI 调用搜索与 AI 提问
- MCP 工具调用搜索与详情查询
- 5 个新工具各自的核心调用路径
