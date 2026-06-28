# 落地页 GSAP 高级沉浸式滚动动效 + 移动端重设计方案

## Summary

为 Starlens 落地页引入 GSAP + ScrollTrigger，实现高级沉浸式滚动交互动效（统一滚动技术栈），并**全面重设计移动端布局**，解决当前移动端布局混乱、组件被粗暴砍裁、信息密度低等问题。

两大模块：
1. **GSAP 滚动动效** — 首屏入场、视差、标题揭示、卡片 batch、滚动追踪器 GSAP 化
2. **移动端重设计** — Hero 简化、ProductPreview 移动适配、导航汉堡菜单、卡片网格优化、代码块横向滚动、断点重构

## Current State Analysis

### 页面区块结构（landing-page.tsx）
```
ClickSpark (wrapper)
└── div.landing-page
    ├── LandingInteractions (Canvas 鼠标指针 + 滚动追踪器)  ← 拆分
    ├── header.landing-header (sticky 导航)  ← 移动端需汉堡菜单
    └── main
        ├── section#hero.landing-hero (首屏: copy + ProductPreview + scroll-hint)
        ├── section#pain.landing-pain (痛点: 3 卡片 grid)
        ├── section#features (功能: 3 卡片 grid + FeatureMock)
        ├── section#workflow (工作方式: Web截图 + CLI代码块 + Agent卡片)
        ├── section#providers (AI服务: provider 卡片 + security-note)
        └── section#deploy (部署: 3 article)
    └── footer#docs.landing-footer
```

### 现有 LandingInteractions 组件分析（landing-interactions.tsx）
当前组件承担**两类职责**，需拆分：
1. **Canvas 鼠标指针**（L36-206, L243-252, L272-281）→ 保留不动
   - requestAnimationFrame 粒子物理循环（产生/消亡/重力/自旋/拖尾）
   - 这是粒子系统，GSAP 是补间库不适合替换
2. **滚动追踪器**（L208-241, L255-257, L282-296）→ 迁移到 GSAP
   - `updateScrollState()`: 手动 RAF + scroll 监听计算进度与活跃区块
   - 设置 `--landing-scroll-progress` CSS 变量驱动顶部进度条
   - `setActiveSection()` 驱动右侧圆点高亮
   - 与 GSAP ScrollTrigger 解决同一类问题，应合并

### 移动端问题诊断（核心痛点）
1. **ProductPreview 被砍半** — `.landing-preview__sidebar` 和 `.landing-preview__detail` 在 `max-width: 780px` 直接 `display: none`，预览组件失去意义
2. **CLI 代码块横向溢出** — `<pre>` 固定宽度终端文本撑破窄屏容器
3. **grid 粗暴塌缩单列** — providers 本是 2 列在 780px 也变 1 列，信息密度低
4. **Hero CTA 按钮全宽笨重** — 两个按钮各占一行
5. **导航直接消失** — 无汉堡菜单替代
6. **timeline 缩略图被砍** — 只剩 3 个
7. **断点层层覆盖混乱** — 780px 断点反复修补 padding，维护困难

### 依赖状态
- **GSAP 未安装**，需新增 `gsap` + `@gsap/react`
- `motion` (Framer Motion v12) 已安装但落地页未使用，与 GSAP 无冲突

---

## Module 1: GSAP 高级沉浸式滚动动效

### 1.1 安装依赖
```bash
corepack pnpm --filter @starlens/web add gsap @gsap/react
```

### 1.2 新建组件 `landing-scroll-animations.tsx`
**路径**: `apps/web/src/components/landing-scroll-animations.tsx`
**职责**: 集中管理所有 GSAP 滚动动效 + 滚动追踪器

**核心实现要点**:
- 使用 `useGSAP()` hook 确保组件卸载时自动 revert 所有动画与 ScrollTrigger
- `gsap.registerPlugin(ScrollTrigger)` 注册插件
- `gsap.matchMedia()` 响应 `prefers-reduced-motion: reduce`（无障碍）
- `gsap.matchMedia()` 区分桌面 `(min-width: 781px)` 与移动 `(max-width: 780px)`

**动画清单**:

#### a. 首屏入场动画（onLoad）
- `.landing-hero__copy` 子元素 stagger 上移 + 淡入（kicker → h1 → lead → actions → proof-row）
- ProductPreview 延迟 0.3s 缩放 + 淡入
- scroll-hint 延迟 1s 淡入

#### b. Hero 滚动视差退出（scrub，仅桌面）
- copy 上移 80px + 淡出，visual 缩放 0.92 + 淡出，scroll-hint 淡出
- `scrollTrigger { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1 }`

#### c. 区块标题揭示
- 每个 `.landing-section-heading` 内 `.landing-pill`、`h2`、`p`
- 进入视口 80% 时 y:30 + opacity:0 → 上移淡入，stagger 0.15
- `toggleActions: "play none none reverse"`

#### d. 卡片 batch 错落入场
- `.landing-pain-card`、`.landing-feature-card`、`.landing-workflow-card`、`.landing-provider-card`、`.landing-deploy-grid > article`
- `ScrollTrigger.batch()`，y:60 + opacity:0 → y:0 + opacity:1，stagger 0.12
- `start: "top 85%"`，`batchMax: 4`，`onLeaveBack` 重置

#### e. 装饰元素视差（scrub，仅桌面）
- `.landing-provider-logo`、`.landing-deploy-grid article svg`
- 轻微 y 位移视差（±20px），`scrub: 2`

#### f. 安全提示滑入
- `.landing-security-note` 从 x:-30 + opacity:0 滑入

#### g. 页脚 CTA 揭示
- `.landing-footer__cta` 缩放 0.9 + opacity:0 → 1

#### h. 滚动追踪器 GSAP 化（替换原手写逻辑）
- **顶部进度条**: 全局 ScrollTrigger `onUpdate` 更新 `--landing-scroll-progress`
- **区块圆点**: 每个 section 一个 ScrollTrigger `onToggle` 更新 `activeSection` state
- JSX（`.landing-scroll-tracker`）从 landing-interactions.tsx 迁移到本组件

### 1.3 重构 `landing-interactions.tsx`（精简）
- **移除**: 滚动追踪器全部代码（trackerItems、activeSection、updateScrollState、scroll 监听、tracker JSX）
- **保留**: Canvas 鼠标指针全部逻辑不动

### 1.4 挂载到落地页
`landing-page.tsx` 中 `<LandingInteractions />` 旁添加 `<LandingScrollAnimations />`

---

## Module 2: 移动端重设计

### 设计原则
- **移动优先思维** — 不再是桌面端砍裁，而是为移动端独立设计
- **保留核心信息** — ProductPreview 不再隐藏，改为移动专用精简版
- **单手操作友好** — CTA 按钮触手可及，导航可展开
- **信息密度适中** — providers 保持 2 列，卡片紧凑但不拥挤

### 2.1 导航汉堡菜单
**文件**: `landing-page.tsx` + `landing.css`

当前 `max-width: 1180px` 直接 `.landing-nav { display: none }`，无替代。

**改动**:
- 在 header 中新增汉堡菜单按钮（仅移动端可见，`Menu` 图标 from lucide-react）
- 点击展开下拉导航面板（navItems 列表）
- 用 React state 管理展开/收起
- CSS: `.landing-nav-mobile` 全宽下拉面板，`position: absolute` 覆盖在 header 下方
- 点击导航项后自动收起

```tsx
// landing-page.tsx header 内
<button className="landing-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="菜单">
  {menuOpen ? <X /> : <Menu />}
</button>
<nav className={`landing-nav-mobile ${menuOpen ? "is-open" : ""}`}>
  {navItems.map(item => <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
</nav>
```

### 2.2 Hero 首屏移动端重设计
**问题**: CTA 按钮全宽笨重，ProductPreview 被砍半

**改动**:
- CTA 按钮改为 `width: auto` + `flex: 1`，两个按钮并排排列，紧凑美观
- 按钮高度从 `h-14` 降为 `h-12`，字号略减
- ProductPreview: 保留中间列表区（`.landing-preview__main`），sidebar/detail 隐藏
- 新增移动端精简版预览：只显示搜索栏 + 过滤标签 + 3 条 repo 列表 + timeline 简化
- timeline 缩略图改为横向滚动（`overflow-x: auto`），不砍裁

### 2.3 卡片网格优化
**问题**: 所有 grid 粗暴塌缩单列

**改动**:
- **痛点卡片** (`.landing-pain-grid`): 保持单列（内容多，单列更易读）
- **功能卡片** (`.landing-feature-grid`): 保持单列（含 FeatureMock）
- **工作方式** (`.landing-workflow-grid`): 保持单列（含截图和代码块）
- **AI 服务** (`.landing-provider-grid`): 改为 **2 列**（provider 卡片内容少，2 列更紧凑）
- **部署** (`.landing-deploy-grid`): 保持单列
- 卡片间距 `gap` 从 28px 降为 16px

### 2.4 CLI 代码块横向滚动
**问题**: `<pre>` 固定宽度终端文本撑破窄屏

**改动**:
```css
@media (max-width: 780px) {
  .landing-terminal-card pre {
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre;
    -webkit-overflow-scrolling: touch;
  }
}
```

### 2.5 断点重构与清理
**问题**: 780px 断点层层覆盖 padding，维护混乱

**改动**:
- **统一断点策略**: `1180px`（平板/小桌面）、`780px`（手机）两个断点
- 780px 断点内**重新声明**所有移动端专用值，不再依赖 1180px 继承再覆盖
- 移除之前反复修补的 padding 覆盖（14px→16px 那些临时补丁）
- 统一移动端左右 padding 为 `16px`
- 卡片 padding 统一 `20px`

### 2.6 页脚移动端优化
**当前**: footer__links 3 列，CTA 紧凑栅格 — 这个已经做得不错，保留
**微调**:
- footer__brand 居中显示
- footer__links gap 从 16px 调为 12px

### 2.7 滚动追踪器移动端处理
- 顶部进度条: 保留（移动端也有用）
- 右侧圆点: 移动端隐藏（小屏占用空间）或移到底部

---

## Assumptions & Decisions

1. **不移除现有 motion 库** — 与 GSAP 无冲突
2. **不使用 pinning** — 落地页是转化页，pinning 增加摩擦
3. **Canvas 鼠标指针保留** — 粒子系统是 RAF+Canvas 的领域
4. **滚动追踪器迁移 GSAP** — 统一滚动技术栈
5. **移动端简化动效** — 仅 fade/slide，无 parallax
6. **无障碍优先** — `prefers-reduced-motion: reduce` 跳过动画
7. **移动端导航** — 汉堡菜单而非底部 tabbar（落地页非 App）
8. **ProductPreview 移动版** — 保留核心列表，隐藏 sidebar/detail，timeline 横滚
9. **providers 保持 2 列** — 内容少，2 列信息密度更优
10. **FOUC 防护** — 用 `gsap.set()` 在 useLayoutEffect 设初始态，不预设 CSS opacity:0

---

## Implementation Order

1. 安装 `gsap` + `@gsap/react`
2. 新建 `landing-scroll-animations.tsx`（GSAP 动效 + 滚动追踪器迁移）
3. 重构 `landing-interactions.tsx`（移除滚动追踪器，仅保留 Canvas）
4. `landing-page.tsx` — 挂载新组件 + 新增汉堡菜单
5. `landing.css` — 移动端重设计（Hero/导航/卡片/代码块/断点清理）
6. `corepack pnpm build` 验证

## Verification Steps

1. `corepack pnpm --filter @starlens/web add gsap @gsap/react` 安装成功
2. `corepack pnpm build` 编译通过，无 TypeScript 错误
3. **桌面端浏览器验证**:
   - 首屏加载时元素 stagger 入场
   - 滚动时 Hero 元素视差淡出
   - 各区块标题进入视口时上移淡入
   - 卡片 batch 错落入场，滚回时重置
   - 装饰图标轻微视差
   - 顶部进度条随滚动增长（GSAP 驱动）
   - 右侧圆点随区块切换高亮（GSAP 驱动）
   - 开启系统「减少动态效果」时无动画、内容直接可见
4. **移动端浏览器验证**（375px 宽度）:
   - 汉堡菜单可展开/收起，点击导航项跳转后自动收起
   - Hero CTA 按钮并排紧凑，不再全宽笨重
   - ProductPreview 显示精简列表，不撑破容器
   - timeline 缩略图可横向滚动
   - CLI 代码块可横向滚动，不撑破容器
   - providers 卡片 2 列排列
   - 卡片间距适中，无过大留白
   - 页脚排列整齐
5. 确认 Canvas 鼠标指针功能不受影响
6. 确认 landing-interactions.tsx 中已无 scroll 监听残留代码
