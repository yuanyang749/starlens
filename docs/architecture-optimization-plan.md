# Starlens 架构优化方案

> **状态：执行计划，不是当前行为契约。** 已完成/未完成项以本页状态表为参考，具体实现仍以代码、`docs/api-contract.md` 和 `docs/database-schema.md` 为准。

## 0. 执行状态更新（2026-07-15）

- **P0 已完成**：`WorkbenchView` 已拆分（`apps/web/src/components/workbench/` 下的 topbar/sidebar/repo-table-pane/repo-detail-panel 等）；AI 问答已演进为工具调用 Agent，主要职责分布在 `ask/agent/loop.ts`、`dispatch.ts`、`tool-schemas.ts`、`sql-validator.ts` 和 `provider.ts`，`ai/ask/route.ts` 保持薄入口。
- **P1 尚未完成**：
  - 限流仍是进程内 `Map`（`packages/server/src/server/ai/rate-limit.ts:7`），未迁移到 Redis/DB，多实例部署下限流状态仍不一致。
  - Hosted MCP Base URL 仍以硬编码默认值兜底（`apps/web/src/app/api/mcp/route.ts:9`），虽已支持环境变量覆盖，但尚未完全消除硬编码默认值。
  - 结论：**在真正推进多实例 / Hosted 部署之前，请先处理这两项，再归档本文档。**
- **P1 已完成（同步可靠性）**：`sync_runs` 已持久化分页同步的进度、累计统计、错误和任务历史。首次导入每请求只处理一页，Web、Mobile、CLI 和 Agent 会自动续跑；刷新、实例重启或可恢复错误后可从已完成页恢复。
- **P2 已完成**：`scripts/check-api-shims.mjs` 已落地，覆盖 Web/Mobile API shim 一致性校验。

以下第 1-10 节为原始方案全文，作为 P1 剩余项的实施参考保留。

## 1. 文档目标

这份文档用于把当前项目分析中识别出的主要架构问题整理成一份可执行的优化方案，明确：

- 当前架构的主要优点和风险点
- 哪些问题值得优先处理
- 每个优化项的目标、边界和建议拆分方式
- 建议的实施顺序、验收标准和风险控制方式

本文档服务对象主要包括：

- `packages/server` 的后端开发
- `apps/web` 和 `apps/mobile` 的前端开发
- 后续要扩展 CLI、MCP、Hosted 部署能力的维护者

## 2. 当前架构结论

Starlens 当前整体架构是健康的，核心优点在于：

- 使用 `pnpm workspace` 组织多端代码
- `Web / Mobile / CLI / MCP` 复用统一 API 和业务能力
- `packages/server` 作为后端核心，边界清晰
- `packages/core` 和 `packages/agent-tools` 提供了较稳定的共享契约
- 数据模型围绕 GitHub Stars 工作台场景设计，贴近实际需求

当前并不存在“需要推翻重做”的系统性问题。优化重点不在于改换技术栈，而在于继续降低复杂度、提升可维护性，并为后续能力扩展留出空间。

## 3. 优化目标

本轮优化的目标聚焦在以下四件事：

- 降低单文件和单组件复杂度
- 让 AI 查询链路更易测试、更易演进
- 为多实例部署和 Hosted 场景提前清理状态管理风险
- 减少跨端和跨入口的机械重复维护成本

不作为本轮目标的内容：

- 更换数据库或框架
- 引入向量数据库或重型 RAG 体系
- 重写 CLI、MCP 或前端工作台
- 大规模重做 UI 视觉设计

## 4. 当前主要问题

### 4.1 `WorkbenchView` 组件过重

当前 `apps/web/src/components/workbench-view.tsx` 同时承担了：

- 页面级容器职责
- 请求发起与错误处理
- 搜索、同步、AI 搜索、备注、标签、收藏等状态管理
- 列表和详情面板联动
- Dashboard、设置域、工作台内容区切换

这会带来几个问题：

- 新功能容易继续堆进同一文件
- 数据逻辑和展示逻辑耦合过深
- 单元测试和局部回归测试成本较高
- 一处状态调整容易影响多个交互分支

### 4.2 AI 问答路由职责过多

当前 `packages/server/src/routes/ai/ask/route.ts` 已经同时承载：

- 限流
- 意图识别
- 查询扩词
- 候选召回
- 候选精排
- Provider 调用
- 回答拼装
- 多种问答分支逻辑

这导致：

- 单文件认知成本高
- 规则和提示词迭代时风险高
- 难以针对某个子环节单独测试
- 不利于后续支持更多 Provider 策略或实验性召回逻辑

### 4.3 进程内状态不适合未来扩展

当前项目还保留一类典型进程内状态：

- AI 问答限流桶

GitHub 同步历史与续跑进度已迁移到持久化的 `sync_runs`，不再依赖单进程内存。

这在单机开发或轻量部署时完全可用，但存在天然限制：

- 服务重启后状态丢失
- 多实例部署时各实例状态不一致
- Hosted 或 Serverless 场景下行为不稳定

### 4.4 Web / Mobile API shim 仍存在机械重复

虽然主要业务逻辑已经收敛到 `packages/server`，但 `apps/web/src/app/api` 和 `apps/mobile/src/app/api` 仍各自维护一套转发路由文件。

问题不在于当前实现错误，而在于后续 API 数量继续增长时：

- 新增接口需要重复加两次文件
- 重构目录时容易遗漏
- 机械维护成本会持续增长

### 4.5 Hosted MCP 仍有环境配置硬编码

当前 `apps/web/src/app/api/mcp/route.ts` 中对 Hosted API Base URL 采用硬编码常量。

这会影响：

- 多环境部署灵活性
- 自托管场景下的复用能力
- 后续若支持不同域名或白标部署时的可配置性

## 5. 优化优先级

建议按下面的优先级推进：

### P0：立即值得做

- 拆分 `packages/server/src/routes/ai/ask/route.ts`
- 拆分 `apps/web/src/components/workbench-view.tsx`

### P1：在准备 Hosted / 多实例部署前完成

- 将限流从进程内状态迁移到持久化或外部状态层
- 清理 Hosted MCP 配置硬编码

### P2：中期维护性优化

- 收敛 Web / Mobile API shim 的重复维护成本
- 视情况进一步整理 `agent-tools` 为更明确的 API SDK 层

## 6. 详细优化方案

### 6.1 拆分 `WorkbenchView`

#### 优化目标

- 让页面容器只负责布局编排和顶层模式切换
- 让数据获取、工作台状态、乐观更新逻辑独立出去
- 让列表区、详情区、AI 搜索报告区和设置区边界更清晰

#### 建议拆分方式

建议把当前文件拆为三层：

- 页面壳层
  - 负责整体布局和区域组合
- 状态与数据层
  - 负责搜索参数、请求、副作用、乐观更新
- 展示层
  - 负责纯 UI 渲染

可参考的拆分方向：

- `use-workbench-data.ts`
  - 列表、详情、同步、AI 搜索相关请求
- `use-workbench-actions.ts`
  - 收藏、备注、标签、AI 搜索、同步等交互动作
- `workbench-layout.tsx`
  - 只负责容器编排
- `ai-search-report.tsx`
  - 抽离 AI 搜索报告展示
- `workbench-content.tsx`
  - 统一承载列表区和详情区组合

#### 推荐改造边界

第一阶段不建议立刻把所有状态都拆成很多 hook，而是先做一次“职责切层”：

- 保留现有行为不变
- 先把请求逻辑和布局渲染分开
- 再把收藏、标签、备注等交互动作下沉到单独模块

#### 验收标准

- `WorkbenchView` 文件长度和复杂度显著下降
- 顶层组件中不再直接堆积大量请求与副作用
- 现有搜索、同步、AI 搜索、备注、标签、收藏行为保持不变
- 新增工作台功能时，不需要继续往单一文件中堆逻辑

### 6.2 拆分 AI 问答路由

#### 优化目标

- 把“问答路由入口”和“问答能力编排”分开
- 把可独立测试的子能力模块化
- 降低模型调用、意图识别和召回逻辑的耦合

#### 建议模块边界

建议按职责拆分为以下模块：

- `intent.ts`
  - 意图识别与结构化解析
- `recall.ts`
  - 召回候选仓库
- `ranking.ts`
  - 候选精排与候选上下文构建
- `provider.ts`
  - OpenAI-compatible provider 请求封装
- `rate-limit.ts`
  - 限流逻辑
- `answer.ts`
  - 回答拼装、回退文案、分支回答策略
- `route.ts`
  - 保留最薄的 HTTP 入口、鉴权、参数校验和最终返回

#### 推荐目录结构

建议在 `packages/server/src/server/ai` 下新增子目录，例如：

- `packages/server/src/server/ai/ask/intent.ts`
- `packages/server/src/server/ai/ask/recall.ts`
- `packages/server/src/server/ai/ask/ranking.ts`
- `packages/server/src/server/ai/ask/provider.ts`
- `packages/server/src/server/ai/ask/answer.ts`
- `packages/server/src/server/ai/ask/rate-limit.ts`

然后让 `packages/server/src/routes/ai/ask/route.ts` 只做：

- 用户身份解析
- 输入校验
- 运行时配置装配
- 调用上层编排函数
- 输出统一响应

#### 实施建议

优先做“等价重构”：

- 不改行为
- 不先改提示词策略
- 先把已有逻辑按模块搬开

等结构稳定后，再考虑：

- 调整召回策略
- 提升意图识别精度
- 引入更多 Provider 差异化处理

#### 验收标准

- 路由入口文件显著收敛
- 意图识别、召回、排序、Provider 调用都可以单独测试
- AI 查询行为与当前版本保持基本一致
- 后续新增一种问答分支时，不需要再改一个超大单文件

### 6.3 清理进程内状态

#### 优化目标

- 避免单实例内存状态成为未来部署瓶颈
- 让限流在多实例场景下行为一致；同步历史已通过 `sync_runs` 持久化

#### 限流建议

短期可选方案：

- 数据库存储简单时间窗口计数

中期更推荐：

- Redis 存储用户级限流桶

原则：

- 用户自有 Key 和系统共享 Key 继续保留不同限流策略
- 限流实现与路由逻辑解耦
- 限流策略可配置，不写死在主业务文件中

#### 同步历史建议

当前同步历史若需要在 UI 中稳定展示，建议持久化到数据库：

- 已完成：新增 `sync_runs` 表，并将同步进度和最近历史迁移到持久化存储
- 记录开始时间、结束时间、状态、错误级别、计数摘要

如果当前只需要短期展示，也可以先保留轻量实现，但需明确：

- 该能力不保证重启后保留
- 不作为长期 Hosted 能力依赖

#### 验收标准

- 多实例部署下限流行为一致
- 同步历史不依赖单进程内存
- 服务重启后用户体验不出现明显异常

### 6.4 收敛 API shim 重复

#### 优化目标

- 降低 Web 和 Mobile 重复维护 API 路由文件的成本
- 避免新增接口时需要手工同步两套目录

#### 建议方向

有两种可选思路：

第一种，保持现状但增加生成或校验机制：

- 通过脚本检查 Web / Mobile API 路由是否齐全
- 继续保留薄路由文件

第二种，进一步抽象 route handler 工厂：

- 在共享包中导出统一 handler
- Web / Mobile 只保留最小入口层

当前更推荐第一种，原因是：

- 改造成本低
- 不影响 Next.js App Router 现有结构
- 能先解决“容易漏”和“重复维护”问题

#### 验收标准

- 新增 API 时不再依赖人工对照检查
- Web 和 Mobile API 路由差异是显式、可验证的

### 6.5 清理 Hosted MCP 配置硬编码

#### 优化目标

- 让 Hosted MCP 更适合多环境、自托管和后续部署扩展

#### 建议做法

把当前 MCP Route 中的固定地址改为环境变量驱动，例如：

- 优先读取部署环境中的公开 API Base URL
- 未配置时再回退到默认值

同时明确区分两类场景：

- 官方 Hosted 默认值
- 自托管部署显式配置值

#### 验收标准

- 不改代码即可切换部署域名
- Hosted 与自托管都能沿用同一路由实现

## 7. 建议实施顺序

### 第一阶段：结构收敛

- 拆分 `WorkbenchView`
- 拆分 AI 问答路由

目标：

- 先把最明显的复杂度热点降下来

### 第二阶段：部署稳定性

- 迁移限流状态
- 验证 `sync_runs` 的恢复行为与迁移执行情况
- 清理 MCP 环境硬编码

目标：

- 为 Hosted 和多实例部署扫清主要障碍

### 第三阶段：维护性补强

- 增加 API shim 一致性校验
- 评估是否继续整理 `agent-tools` 为更稳定的 SDK 层

目标：

- 降低后续中小功能迭代的维护成本

## 8. 风险控制建议

### 8.1 先做等价重构，不先做行为升级

对于 `WorkbenchView` 和 AI 问答链路，建议第一步只做结构拆分，不同时引入新功能或新策略，避免风险叠加。

### 8.2 每个阶段都保留回归检查点

至少覆盖以下核心路径：

- 页面首次打开
- 搜索与过滤
- 仓库详情查看
- 收藏、备注、标签
- 手动同步
- AI 搜索
- CLI 调用搜索与 AI 提问
- MCP 工具调用搜索与详情查询

### 8.3 避免过度抽象

本轮优化的目标是“让现有系统更稳更清晰”，不是为了追求更花哨的架构。凡是不能明显降低复杂度或提升演进效率的抽象，都不建议提前做。

## 9. 预期结果

完成以上优化后，项目应达到以下状态：

- 核心前端页面不再依赖超大容器组件承载全部逻辑
- AI 查询链路具备更清晰的模块边界
- 部署相关状态管理不再过度依赖单进程内存
- Web / Mobile / CLI / MCP 的共享能力继续保留，同时维护成本下降
- 后续新增功能时，开发者能更容易定位该改哪一层

## 10. 建议结论

当前最值得优先执行的两项改造是：

- `apps/web/src/components/workbench-view.tsx` 拆分
- `packages/server/src/routes/ai/ask/route.ts` 拆分

它们是当前系统中最主要的复杂度集中点，也是最容易在后续功能增长时持续放大成本的区域。

在这两项完成后，再推进部署稳定性和 API 重复维护方面的优化，会更稳妥，也更容易获得持续收益。
