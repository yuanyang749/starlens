# Starlens 图表与数据可视化集成设计建议

> **状态：候选方案，尚非产品承诺。** 是否采用及最终实现以公开路线图和代码为准。

本文档探讨了在 Starlens (GitHub Star 个人知识工作台) 中引入 Bklit UI 高颜值图表库的业务场景及具体集成方案。

---

## 一、 为什么引入 Bklit UI？
Starlens 的核心设计目标是使用户的 GitHub Stars 收藏再次发挥作用，并提供 AI 辅助分析。目前，所有的检索结果均以文本列表或卡片形式展示。引入 Bklit UI 后，我们可以利用其极佳的视觉质感（渐变填充、流畅过渡动画、现代色彩搭配），为用户提供直观的**技术画像分析与数据趋势呈现**。

---

## 二、 核心集成场景

### 1. 📊 Stars 统计分析面板 (Stats Dashboard)
这是最直观的图表应用场景。我们可以在工作台（Workbench）中新增一个 **"统计" (Stats)** 标签页或二级路由，展示用户当前 GitHub Stars 数据库的宏观统计画像。

* **技术栈构成 - 环形图 (Ring Chart / Pie Chart)**
  * **场景**：统计用户标星仓库中的**编程语言分布**（例如：TypeScript, Python, Go 等的占比）。
  * **组件**：`@bklit/ring-chart` 或 `@bklit/pie-chart`
  * **价值**：一眼识破用户最近最关注的技术生态。

* **Star 兴趣迁移 - 面积图/折线图 (Area / Line Chart)**
  * **场景**：按月或按年，展示用户**标星的时间增长趋势**与活跃度。
  * **组件**：`@bklit/area-chart`
  * **价值**：直观展示用户的兴趣转移。如果某个月大面积 Star AI 项目，面积图上会有明显的高峰。

* **语言流行度对比 - 柱状图 (Bar Chart)**
  * **场景**：按 **Star 数量区间**（如 `1k-5k`, `5k-10k`, `10k+`）或**最后活跃时间**来对 Star 的项目进行分类对比。
  * **组件**：`@bklit/bar-chart`

* **个人技术多维画像 - 雷达图 (Radar Chart)**
  * **场景**：根据仓库的分类/标签，聚合五个主要方向（如：前端、后端、AI、DevOps、工具链）的雷达图，绘制个性化的“全栈开发者画像”。
  * **组件**：`@bklit/radar-chart`

---

### 2. 🤖 AI 问答 (Ask Stars) 的图表化动态渲染
Starlens 支持 AI 自然语言问答（支持 `stats` 和 `comparison` 意图）。
* **场景**：当用户向 AI 提问时（如：*“我 Star 的项目里，不同语言占比是多少？”*），AI 在分析完本地 PostgreSQL 数据库后，不仅可以用文字回复，还可以在卡片中直接渲染一个 **Bklit 图表**（如饼图或柱状图）。
* **组件**：`@bklit/composed-chart` 或 `@bklit/bar-chart`
* **价值**：极大地提升 AI 问答的可读性与高级感，这也是同类竞品中非常少见的亮点功能。

---

### 3. 📈 单个仓库的星数增长曲线 (Star History)
* **场景**：当用户在详情面板中查看某个标星的 Repo 时，拉取其 GitHub Star History 数据，并利用一条简洁优雅的折线图进行绘制。
* **组件**：`@bklit/line-chart` 或 `@bklit/live-line-chart`
* **价值**：提供类似 `star-history.com` 的精美趋势线，让用户足不出户就能看清 Repo 的热度走势。

---

## 三、 集成与实施计划 ( apps/web )

### 1. 配置注册源
需要在 `apps/web/components.json` 的 `registries` 对象中添加 `@bklit` 注册源，允许 CLI 下载对应的组件源码：
```json
"registries": {
  "@bklit": "https://bklit.com/registry/{name}.json"
}
```

### 2. 测试与验证
1. 在终端运行安装命令（例如安装环形图组件）：
   ```bash
   npx shadcn@latest add @bklit/ring-chart -c apps/web
   ```
2. 在 `apps/web/src/components/` 目录下创建一个测试图表展示组件（例如 `language-stats-chart.tsx`），并使用模拟数据（Mock Data）跑通渲染和 Tooltip。
3. 观察动画和样式在当前项目的 Nova 风格（Radix-Nova / Tailwind v4）下是否兼容良好。
