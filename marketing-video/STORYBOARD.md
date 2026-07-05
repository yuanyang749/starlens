# Starlens 推广视频分镜大纲 (Storyboard)

时长：60s  |  分辨率：1920x1080  |  帧率：60fps

---

## Scene 1: 开场引入 (0.0s - 4.8s)
- status: built
- **画面**：网格背景与呼吸微光星空，Logo 旋转弹入，标题“你的 GitHub Stars 正在变成一片星海”滑入。
- **字幕**：开发者平均 Star 过 500+ 仓库，却很少再打开。
- **目的**：唤起收藏量大但很少回看的技术开发者共鸣。

---

## Scene 2: 痛点呈现 (4.4s - 9.6s)
- **画面**：三个痛点卡片错峰弹入：
  1. Star 太多，想不起名字
  2. 最近 Star，很快就断片
  3. Agent 查不到你的收藏
- **字幕**：这些痛点，Starlens 一次帮你解决。

---

## Scene 3: CLI 秒搜体验 (9.2s - 16.0s)
- **画面**：macOS 暗色终端打字 `stars search "react hooks" --language TypeScript`，结果表格流入。
- **字幕**：装好 CLI，就能按语言和关键词秒搜收藏。

---

## Scene 4: 自然语言问答 (15.6s - 22.0s)
- **画面**：终端输入 `stars ask "哪些 starred repos 适合做本地 RAG？"`，Spinner 旋转，AI 生成推荐列表。
- **字幕**：不记得仓库名？描述需求就能找到。

---

## Scene 5a: Agent 基础整理 (21.6s - 27.5s)
- **画面**：启动 `claude` 连入 Starlens MCP，自动检索 Rust 工具并批量打上 `rust-cli` 标签。
- **字幕**：通过 MCP，Agent 读取并自动整理你的 Stars。

---

## Scene 5b: Agent 主动分析与交互确认 (27.5s - 41.5s) 【核心重点】
- **画面**：
  1. 用户发送链接 `帮我分析一下这个仓库: https://github.com/galacean/effects-runtime`。
  2. `Called starlens` 脉冲卡片高亮弹出，展示主动调用。
  3. 智能提炼场景描述、建议标签与建议备注。
  4. AI 主动询问 `💬 主人尚未 Star 该仓库，需要为您 Star 并同步标签与备注吗？`
  5. 用户回复 `❯ 是的，帮我 Star 并添加标签与备注`。
  6. 绿勾弹亮 `[✓] 已 Star 到 GitHub` / `[✓] 标签与备注已更新`。
- **字幕**：发送 URL，AI 自动提炼用途与备注并交互式确认入库。

---

## Scene 5c: Web 工作台无缝同步 (41.0s - 49.0s) 【核心重点】
- **画面**：
  1. 画面切换至 Starlens Web 工作台，侧边栏与次要列表项呈雾化低透明度遮罩。
  2. 列表第一项 `galacean/effects-runtime` 亮起渐变高亮框。
  3. 右侧详情面板“我的备注”与“同步标签”框闪烁发光红框。
- **字幕**：标签与备注无缝同步至 Web 工作台，随时高效检索。

---

## Scene 6: 多端生态 (48.5s - 54.0s)
- **画面**：Web / Mobile / CLI / MCP 四端卡片弹入，配合主流 LLM 模型 Provider 标签阵列。
- **字幕**：随处可用，多端打通。

---

## Scene 7: CTA 结尾 (53.5s - 60.0s)
- **画面**：Logo 放大旋转居中，标语“开始整理你的 GitHub Stars”与黑金按钮脉冲闪烁。
- **字幕**：立即免费开始，三分钟整理好收藏。
