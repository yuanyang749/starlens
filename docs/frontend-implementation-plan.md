# Starlens 前端实现拆解文档

## 1. 文档目标

这份文档用于把 Starlens Web 端从产品文档推进到前端可实施层，明确：

- 路由如何组织
- 页面如何拆分
- 组件边界如何划分
- 页面状态如何流转
- 哪些 UI 模块优先实现

它主要服务 `apps/web` 和 `apps/mobile` 的前端开发。

## 2. 技术范围

默认前端宿主：

- Next.js App Router

`v1` 前端主要覆盖两类页面：

- 公开落地页
- 登录后应用页
- 手机端工作台

## 3. 路由实现建议

### 3.1 公开层

- `/`
  - 落地页

### 3.2 应用层

- `/app`
  - 主工作台
- `/app/settings`
  - 设置总入口
- `/app/settings/ai`
  - AI provider 配置页
- `/app/settings/tokens`
  - token 管理页
- `/mobile`
  - 手机端工作台
  - 移动设备访问 `/app` 时自动跳转到该入口
  - 桌面设备误入时自动回到 `/app`

### 3.3 路由组织建议

建议使用 App Router 分层布局：

- 公开层使用一个公共 layout
- 应用层使用单独的 authenticated layout
- 设置页复用应用层布局，不单独脱离主应用风格
- 手机端工作台使用独立移动壳，复用共享 API 与工作台状态逻辑

## 4. 页面拆分

### 4.1 `/` 落地页

建议拆成以下区块组件：

- `LandingHeader`
- `LandingHero`
- `FeatureSection`
- `WorkflowSection`
- `ProviderSupportSection`
- `OpenSourceSection`
- `LandingFooter`

说明：

- 落地页是公开介绍页，不读取用户私有数据
- 工作台预览图可先使用静态 mockup 图

### 4.2 `/app` 主工作台

建议拆成以下核心组件：

- `AppShell`
- `TopBar`
- `SidebarNav`
- `SearchFilters`
- `RepoList`
- `RepoListItem`
- `RepoDetailPanel`
- `TagEditor`
- `NoteEditor`
- `AISummaryPanel`
- `SyncStatusBadge`

主工作台是最高优先级页面。

### 4.3 `/app/settings`

建议拆成：

- `SettingsShell`
- `SettingsNav`
- `SettingsOverviewCard`

这个页面更多承担设置域导航职责。

### 4.4 `/app/settings/ai`

建议拆成：

- `AIConfigList`
- `AIConfigCard`
- `AIConfigForm`
- `AIConfigValidateButton`
- `AIModelSelector`

### 4.5 `/app/settings/tokens`

建议拆成：

- `TokenList`
- `TokenRow`
- `CreateTokenDialog`
- `RevokeTokenDialog`

### 4.6 `/mobile` 手机端工作台

当前已实现为 `apps/mobile` 独立应用，并在 `apps/web` 中通过 `/mobile` 路由复用。

核心模块：

- `MobileWorkbench`
  - 移动端工作台壳
  - 顶部搜索、同步、过滤、列表、详情覆盖层、底部导航
- `MobileSignIn`
  - 移动端未登录承接页
- `MobileWorkspaceRedirect`
  - `/app` 到 `/mobile` 的移动端入口判断
- `DesktopWorkspaceRedirect`
  - `/mobile` 到 `/app` 的桌面端回退判断
- `useMobileWorkbench`
  - 位于 `packages/workbench`
  - 负责移动端搜索、分页、详情、同步、AI 搜索、收藏、备注、标签和设置数据

## 5. 主工作台状态流

### 5.1 顶层状态

`/app` 页面至少需要管理这些状态：

- 当前搜索词
- 当前过滤器
- 当前排序方式
- 当前选中的 repo id
- 仓库列表加载状态
- 仓库详情加载状态
- 同步状态

### 5.2 推荐状态分层

建议划分为：

- URL 状态
  - `q`
  - `language`
  - `owner`
  - `tag`
  - `favorite`
  - `sort`
- 页面本地状态
  - 当前高亮行
  - 面板展开 / 收起
  - 对话框开关
- 服务端数据状态
  - 搜索结果
  - 仓库详情
  - token 列表
  - AI 配置列表

### 5.3 推荐行为

- 搜索和过滤尽量反映到 URL query 中
- 当前选中仓库可以先保存在本地状态，`v1` 不强制做独立详情深链接
- 设置页内部视图由路由决定，不靠 tab 假路由
- 移动端详情通过 `/mobile?repo=<id>` 打开覆盖层，关闭后回到 `/mobile`
- 移动端分页优先使用滚动加载，减少小屏上的分页控件负担

## 6. 数据获取建议

### 6.1 `/app`

主工作台建议拆成两层数据获取：

- 列表数据：`GET /api/search`
- 详情数据：`GET /api/repos/:id`

行为建议：

- 列表先加载
- 默认自动选中第一条结果
- 切换选中项时再获取详情

### 6.2 同步

- 顶部同步按钮调用 `POST /api/sync`
- 返回后立即更新同步状态
- 可轮询详情或用户状态接口获取最终结果

`v1` 若没有专门状态接口，可先采用“触发成功 + 后续刷新列表”的轻量策略。

### 6.3 AI 设置页

依赖接口：

- `GET /api/ai/configs`
- `POST /api/ai/configs`
- `PATCH /api/ai/configs/:id`
- `DELETE /api/ai/configs/:id`
- `POST /api/ai/configs/:id/validate`
- `GET /api/ai/configs/:id/models`

### 6.4 Token 页

依赖接口：

- `GET /api/tokens`
- `POST /api/tokens`
- `DELETE /api/tokens/:id`

### 6.5 移动端数据获取

移动端不维护独立后端接口，直接复用 Web API 合同：

- `GET /api/search`
- `GET /api/repos/:id`
- `PATCH /api/repos/:id`
- `POST /api/repos/:id/tags`
- `DELETE /api/repos/:id/tags/:tag`
- `POST /api/sync`
- `POST /api/ai/ask`
- `GET /api/ai/configs`
- `POST /api/ai/configs`
- `POST /api/ai/configs/:id/validate`
- `DELETE /api/ai/configs/:id`
- `GET /api/tokens`
- `POST /api/tokens`
- `DELETE /api/tokens/:id`

这些接口由 `packages/server` 提供 route 处理器，`apps/web` 和 `apps/mobile` 只保留薄 route 转发层。

## 7. 页面级交互设计

### 7.1 搜索

- 顶部搜索框是工作台主入口
- 输入后触发搜索请求
- 支持回车确认和 URL 同步

### 7.2 过滤

- 语言、owner、tag、favorite、sort 放在列表上方或顶部筛选区域
- 常用筛选应常驻可见
- 清空筛选应明显易达

### 7.3 列表与详情联动

- 点击列表项更新右侧详情
- 右侧详情内的标签、备注、收藏操作原地提交
- 操作成功后局部刷新列表和详情

### 7.4 AI 摘要与 AI 搜索

- `v1` AI 搜索可以先做成工作台中的附加面板或局部区域
- 不单独做一个聊天式大页面
- AI 输出必须结构化，并能映射回具体仓库

## 8. 页面优先级

### 第一阶段

优先完成：

- `/`
- `/app`
- `/app/settings/ai`
- `/app/settings/tokens`

### 第二阶段

再补：

- `/app/settings` 概览页细化
- AI 搜索交互增强
- 详情深链接扩展
- 移动端真实设备视觉验收
- 移动端设置页表单体验细化

### 当前实现状态

当前分支已完成：

- `/` 落地页中文重构与交互增强
- `/app` 桌面工作台保留并接入移动端自动跳转
- `/mobile` 手机端工作台入口
- `apps/mobile` 独立 Next.js 应用
- `packages/server` 共享服务包
- `packages/workbench` 移动端工作台状态包
- 移动端搜索、AI 搜索、同步、收藏、备注、标签、详情、AI Provider 和 Token 管理

当前仍需验证：

- `pnpm --filter @starlens/web build`
- `pnpm --filter @starlens/mobile build`
- `pnpm --filter @starlens/workbench test`
- 手机 viewport 和真实设备上的视觉与交互验收

## 9. 组件与样式约束

- 沿用现有 Web UI 设计文档中的视觉约束
- 不引入营销式 hero 组件到 `/app`
- 不把设置页做成完全不同的后台视觉系统
- 列表、详情、设置表单要共享统一的表面、边框和字体风格

## 10. 验收标准

- 落地页与工作台路由边界清晰
- 主工作台能完成搜索、查看、整理三个基本闭环
- 设置页能完成 AI 配置与 token 管理
- 页面状态和 URL 行为一致，不出现明显状态错乱
- 组件边界清楚，后续实现时不需要再重新拆页

## 11. 当前默认决策

- `/` 和 `/app` 明确拆开
- `/app` 采用 shell 布局承载左侧导航、顶部栏和详情区
- 设置域采用独立子路由而不是主工作台弹窗
- 列表与详情双区联动是工作台主交互模式
- AI 搜索先作为工作台增强功能，而不是独立产品形态
