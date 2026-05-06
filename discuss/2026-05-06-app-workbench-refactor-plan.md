# App 工作台页面重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Starlens app 工作台重构为贴近设计稿的桌面三段式工作台，同时保留现有搜索、筛选、同步、收藏、标签、备注等业务行为。

**Architecture:** 保留现有数据流与 API 行为，把当前超大页面容器拆分为顶部工具栏、左侧导航、中央视图区、右侧详情面板等视觉模块，并抽离 URL 状态同步与格式化纯函数。先建立新的文件边界，再替换布局和视觉，最后做验证与回归检查。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest, lucide-react

---

## 文件结构

### 计划创建

1. `apps/web/src/components/workbench/workbench-topbar.tsx`
2. `apps/web/src/components/workbench/workbench-sidebar.tsx`
3. `apps/web/src/components/workbench/repo-table-pane.tsx`
4. `apps/web/src/components/workbench/repo-table-row.tsx`
5. `apps/web/src/components/workbench/repo-detail-panel.tsx`
6. `apps/web/src/components/workbench/repo-detail-metadata.tsx`
7. `apps/web/src/components/workbench/workbench-formatters.ts`
8. `apps/web/src/components/workbench/use-workbench-query-state.ts`

### 计划修改

1. `apps/web/src/components/workbench-view.tsx`
2. `apps/web/src/components/app-frame.tsx`
3. `apps/web/src/components/app-sidebar.tsx`
4. `apps/web/src/app/globals.css`
5. `apps/web/src/test/settings-views.test.tsx`
6. `apps/web/src/test/workbench-view.test.tsx`

## Task 1: 建立可承载新布局的组件边界

**Files:**
- Create: `apps/web/src/components/workbench/workbench-formatters.ts`
- Create: `apps/web/src/components/workbench/use-workbench-query-state.ts`
- Modify: `apps/web/src/components/workbench-view.tsx`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 写失败测试，锁定页面基础可见结构**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkbenchView } from "@/components/workbench-view";

describe("WorkbenchView shell", () => {
  it("renders the desktop workbench landmarks", () => {
    render(<WorkbenchView />);

    expect(screen.getByRole("searchbox", { name: /search your starred repositories/i })).toBeInTheDocument();
    expect(screen.getByText(/workbench/i)).toBeInTheDocument();
    expect(screen.getByText(/repository/i)).toBeInTheDocument();
    expect(screen.getByText(/selected repository/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，原因是当前页面没有设计稿对应的桌面工作台骨架或缺少目标可访问标识。

- [ ] **Step 3: 抽离 URL 状态与格式化纯函数**

```ts
// apps/web/src/components/workbench/workbench-formatters.ts
export function formatWorkbenchDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}
```

```ts
// apps/web/src/components/workbench/use-workbench-query-state.ts
export function useWorkbenchQueryState() {
  return {
    filters: {},
    topbarProps: {},
    sidebarProps: {},
    tableProps: {},
    detailProps: {},
  };
}
```

- [ ] **Step 4: 精简 `workbench-view.tsx` 为容器层**

```tsx
export function WorkbenchView() {
  const queryState = useWorkbenchQueryState();

  return (
    <div className="workbench-shell">
      <WorkbenchTopbar {...queryState.topbarProps} />
      <div className="workbench-body">
        <WorkbenchSidebar {...queryState.sidebarProps} />
        <RepoTablePane {...queryState.tableProps} />
        <RepoDetailPanel {...queryState.detailProps} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，至少能稳定渲染新的桌面工作台骨架。

## Task 2: 重构顶部工具栏与外层页面框架

**Files:**
- Create: `apps/web/src/components/workbench/workbench-topbar.tsx`
- Modify: `apps/web/src/components/app-frame.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 补失败测试，锁定顶部工具栏关键元素**

```tsx
it("renders topbar actions that mirror the design layout", () => {
  render(<WorkbenchView />);

  expect(screen.getByRole("button", { name: /sync now/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /ai search/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，当前头部结构与目标工具栏不一致。

- [ ] **Step 3: 新建顶部工具栏组件**

```tsx
type WorkbenchTopbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  syncing: boolean;
  onSync: () => void;
};

export function WorkbenchTopbar(props: WorkbenchTopbarProps) {
  return (
    <header className="workbench-topbar">
      <div className="workbench-brand">Stars Finder</div>
      <label>
        <span className="sr-only">Search your starred repositories</span>
        <input
          aria-label="Search your starred repositories"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
      </label>
      <button type="button" onClick={props.onSync}>
        {props.syncing ? "Syncing" : "Sync now"}
      </button>
      <button type="button">AI Search</button>
      <button type="button">Filters</button>
    </header>
  );
}
```

- [ ] **Step 4: 收紧外层框架和全局样式**

```tsx
// app-frame.tsx
export function AppFrame({ children }: AppFrameProps) {
  return (
    <div className="app-shell">
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
```

```css
/* globals.css */
.workbench-topbar {
  display: grid;
  grid-template-columns: 240px minmax(420px, 1fr) repeat(5, auto);
  align-items: center;
  gap: 12px;
}
```

- [ ] **Step 5: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，顶部工具栏元素和可访问标签存在。

## Task 3: 重构左侧导航为设计稿样式

**Files:**
- Create: `apps/web/src/components/workbench/workbench-sidebar.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 写失败测试，锁定导航分组和同步卡**

```tsx
it("renders grouped workbench navigation and sync card", () => {
  render(<WorkbenchView />);

  expect(screen.getByText("WORKBENCH")).toBeInTheDocument();
  expect(screen.getByText("DISCOVER")).toBeInTheDocument();
  expect(screen.getByText("SYSTEM")).toBeInTheDocument();
  expect(screen.getByText(/last sync/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，当前侧栏没有设计稿式分组结构。

- [ ] **Step 3: 实现新的左导航组件**

```tsx
export function WorkbenchSidebar() {
  return (
    <aside className="workbench-sidebar">
      <section aria-label="Workbench">
        <h2>WORKBENCH</h2>
        <button type="button">All Stars</button>
        <button type="button">Favorites</button>
        <button type="button">Recent</button>
      </section>
      <section aria-label="Discover">
        <h2>DISCOVER</h2>
        <button type="button">Languages</button>
        <button type="button">Tags</button>
        <button type="button">AI Search</button>
      </section>
      <section aria-label="System">
        <h2>SYSTEM</h2>
        <button type="button">Settings</button>
      </section>
      <div className="workbench-sync-card">Last sync</div>
    </aside>
  );
}
```

- [ ] **Step 4: 让旧 `app-sidebar.tsx` 退出工作台主布局职责**

```tsx
// app-frame.tsx
export function AppFrame({ children }: AppFrameProps) {
  return <div className="app-shell">{children}</div>;
}

// workbench-view.tsx
<div className="workbench-body">
  <WorkbenchSidebar />
  <RepoTablePane />
  <RepoDetailPanel />
</div>
```

- [ ] **Step 5: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，左导航分组和同步卡可见。

## Task 4: 将主列表改造为表格型视图区

**Files:**
- Create: `apps/web/src/components/workbench/repo-table-pane.tsx`
- Create: `apps/web/src/components/workbench/repo-table-row.tsx`
- Modify: `apps/web/src/components/workbench-view.tsx`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 写失败测试，锁定表头与行级摘要**

```tsx
it("renders the repository list as a table-like work area", () => {
  render(<WorkbenchView />);

  expect(screen.getByText("Repository")).toBeInTheDocument();
  expect(screen.getByText("Stars")).toBeInTheDocument();
  expect(screen.getByText("Language")).toBeInTheDocument();
  expect(screen.getByText("Updated")).toBeInTheDocument();
  expect(screen.getByText("Tags")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，当前主区还是卡片列表。

- [ ] **Step 3: 实现表格型主区**

```tsx
export function RepoTablePane({ repos, selectedId, onSelect }: RepoTablePaneProps) {
  return (
    <section className="repo-table-pane" aria-label="Repositories">
      <div className="repo-table-toolbar">
        <input aria-label="Filter repositories" />
      </div>
      <div className="repo-table-head">
        <span>Repository</span>
        <span>Stars</span>
        <span>Language</span>
        <span>Updated</span>
        <span>Tags</span>
      </div>
      <div className="repo-table-body">
        {repos.map((repo) => (
          <RepoTableRow
            key={repo.id}
            repo={repo}
            selected={repo.id === selectedId}
            onSelect={() => onSelect(repo.id)}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 把仓库卡片渲染迁移为行级布局**

```tsx
export function RepoTableRow({ repo, selected, onSelect }: RepoTableRowProps) {
  return (
    <button type="button" className={selected ? "repo-row repo-row--selected" : "repo-row"} onClick={onSelect}>
      <span>{repo.fullName}</span>
      <span>{repo.stargazersCount}</span>
      <span>{repo.language}</span>
      <span>{formatWorkbenchDate(repo.pushedAtGithub)}</span>
      <span>{repo.tags.join(", ")}</span>
    </button>
  );
}
```

- [ ] **Step 5: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，主区已切换为设计稿式表格视图。

## Task 5: 将右侧详情区改造为连续型检查面板

**Files:**
- Create: `apps/web/src/components/workbench/repo-detail-panel.tsx`
- Create: `apps/web/src/components/workbench/repo-detail-metadata.tsx`
- Modify: `apps/web/src/components/workbench-view.tsx`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 写失败测试，锁定详情区主要模块**

```tsx
it("renders the selected repository in a right-hand detail panel", () => {
  render(<WorkbenchView />);

  expect(screen.getByText(/selected repository/i)).toBeInTheDocument();
  expect(screen.getByText(/my note/i)).toBeInTheDocument();
  expect(screen.getByText(/ai summary/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /open in github|open on github/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，当前详情区结构与目标检查面板不一致。

- [ ] **Step 3: 实现右侧详情面板**

```tsx
export function RepoDetailPanel({ repo }: RepoDetailPanelProps) {
  if (!repo) {
    return <aside className="repo-detail-panel">Select a repository to inspect it.</aside>;
  }

  return (
    <aside className="repo-detail-panel" aria-label="Selected repository">
      <header>
        <p>Selected repository</p>
        <h2>{repo.fullName}</h2>
      </header>
      <a href={repo.htmlUrl} target="_blank" rel="noreferrer">
        Open on GitHub
      </a>
      <p>{repo.description}</p>
      <RepoDetailMetadata repo={repo} />
      <section>
        <h3>My note</h3>
      </section>
      <section>
        <h3>AI summary</h3>
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: 用指标网格承接统计字段**

```tsx
export function RepoDetailMetadata({ repo }: RepoDetailMetadataProps) {
  return (
    <div className="repo-detail-metadata">
      <span>{repo.stargazersCount} stars</span>
      <span>{repo.language}</span>
      <span>{repo.license.name}</span>
      <span>{repo.defaultBranch}</span>
    </div>
  );
}
```

- [ ] **Step 5: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，详情区主模块存在且结构稳定。

## Task 6: 用设计稿视觉 token 收紧全局样式

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/workbench/workbench-topbar.tsx`
- Modify: `apps/web/src/components/workbench/workbench-sidebar.tsx`
- Modify: `apps/web/src/components/workbench/repo-table-pane.tsx`
- Modify: `apps/web/src/components/workbench/repo-detail-panel.tsx`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 写失败测试，锁定主视觉类名和关键区域存在**

```tsx
it("renders the four-zone desktop workbench layout", () => {
  render(<WorkbenchView />);

  expect(screen.getByTestId("workbench-topbar")).toBeInTheDocument();
  expect(screen.getByTestId("workbench-sidebar")).toBeInTheDocument();
  expect(screen.getByTestId("repo-table-pane")).toBeInTheDocument();
  expect(screen.getByTestId("repo-detail-panel")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，重构前或半成品阶段缺少稳定的四区标识。

- [ ] **Step 3: 更新视觉 token**

```css
:root {
  --background: #f5f7fb;
  --foreground: #1f2937;
  --muted: #6b7280;
  --line: #e5e7eb;
  --panel: #ffffff;
  --panel-strong: #ffffff;
  --accent: #2563eb;
  --accent-soft: #e8f0ff;
}
```

- [ ] **Step 4: 为四大区域加入稳定布局类与 data-testid**

```tsx
<header data-testid="workbench-topbar" className="workbench-topbar" />
<aside data-testid="workbench-sidebar" className="workbench-sidebar" />
<section data-testid="repo-table-pane" className="repo-table-pane" />
<aside data-testid="repo-detail-panel" className="repo-detail-panel" />
```

- [ ] **Step 5: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，四区布局具备稳定标识，后续视觉验收有抓手。

## Task 7: 补齐关键行为回归验证

**Files:**
- Modify: `apps/web/src/test/workbench-view.test.tsx`
- Modify: `apps/web/src/test/settings-views.test.tsx`
- Test: `apps/web/src/test/workbench-view.test.tsx`

- [ ] **Step 1: 补失败测试，覆盖收藏与备注等关键交互入口**

```tsx
it("keeps favorite and note controls available for the selected repo", () => {
  render(<WorkbenchView />);

  expect(screen.getByRole("button", { name: /favorite|favorited/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /my note/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: FAIL，如果重构中遗失关键入口会直接暴露。

- [ ] **Step 3: 调整组件可访问标识，保持行为入口完整**

```tsx
<button type="button" aria-label={repo.isFavorite ? "Favorited" : "Favorite"}>
  ...
</button>

<textarea aria-label="My note" value={noteDraft} onChange={...} />
```

- [ ] **Step 4: 重新运行测试**

Run: `corepack pnpm --filter @starlens/web test -- workbench-view`

Expected: PASS，关键交互入口仍然存在。

- [ ] **Step 5: 执行完整 web 测试**

Run: `corepack pnpm --filter @starlens/web test`

Expected: PASS，至少不引入现有测试回归。

## Task 8: 构建与手工验收

**Files:**
- Modify: 实现过程中涉及的所有目标文件
- Test: N/A

- [ ] **Step 1: 执行构建检查**

Run: `corepack pnpm --filter @starlens/web build`

Expected: PASS，Next.js 构建通过。

- [ ] **Step 2: 启动本地开发服务**

Run: `corepack pnpm --filter @starlens/web dev`

Expected: 本地可打开工作台页面，无启动报错。

- [ ] **Step 3: 按设计稿做桌面视觉核对**

```text
检查项：
1. 顶部工具栏是否为单排高密度结构。
2. 左导航是否包含 WORKBENCH / DISCOVER / TOOLS / SYSTEM 分组。
3. 中央列表是否已表格化。
4. 右侧详情是否为连续型检查面板。
```

- [ ] **Step 4: 做关键行为手工回归**

```text
检查项：
1. 搜索与筛选是否仍可工作。
2. 选中仓库后详情区是否联动。
3. 收藏按钮是否可点击。
4. 标签新增删除与备注输入是否仍可达。
5. Sync now 状态反馈是否仍可见。
```

- [ ] **Step 5: 记录结果并整理最终变更说明**

```text
输出：
1. 已修改文件列表。
2. 已执行的测试与构建命令。
3. 剩余风险，例如移动端只做合理降级而未做精细视觉还原。
```
