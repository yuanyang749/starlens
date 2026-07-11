// 安装向导的本地化消息字典。
// 所有面向用户的文本集中在此,en/zh 两个对象的 key 严格一一对应。
// 含变量的文本用 {0}/{1} 占位符,调用方用 .replace("{0}", value) 替换。
//
// 维护规则:
//  - 新增 key 时必须同时在 en 和 zh 添加,否则测试会失败(messages 字典完整性测试)
//  - 不做 fallback:缺 key 即视为 bug,由测试覆盖保证
//  - wizardCheckbox 的 4 条 UI 原语提示不在此处,由调用方通过 labels 参数传入(见 prompts.mjs)

export const messages = {
  en: {
    // Step 0: 语言选择(双语展示,所以只有一份)
    languagePrompt: "Language / 语言:\n  1) English\n  2) 中文",

    // 欢迎与提示 — setup 向导
    wizardTitle: "Starlens Setup Wizard",
    wizardIntro: "This wizard installs the Agent Skill (via npx skills add) and configures MCP Server.",
    // install-mcp 向导(只配 MCP)
    mcpWizardTitle: "Starlens MCP Config Wizard",
    mcpWizardIntro: "This wizard configures MCP Server for your AI clients. Skill installation is separate (use npx skills add).",

    sourceTip: "Tip: you are running from source. To use `stars` globally,\n      install first: npm install -g @starlens-app/cli",

    // Step 1: 安装 Skill (仅 setup 向导)
    installingSkill: "Installing Starlens Agent Skill via npx skills add...",
    skillInstallFailed: "⚠  Skill install failed: {0} ({1})",
    skillInstallFailedReason: "command failed or not found",
    skillManualHint: "  Run manually later: {0}",

    // Step 2: 配置 MCP
    mcpNoSupportedClients: "Selected clients do not support MCP. Skipping MCP configuration.",
    mcpConfigurePrompt: "Configure MCP Server? (supports {0}) (y/N)",
    hostedModeFlag: "✓ Hosted service mode (--hosted)",
    selfHostedModeFlag: "✓ Self-hosted mode (--local)",
    deploymentModeTitle: "Deployment mode:",
    deploymentModeHosted: "  1) Hosted (recommended) — uses starlens.520ai.xin, no local service needed",
    deploymentModeSelfHosted: "  2) Self-hosted — your own server or local dev environment",
    deploymentModePrompt: "Choose mode",
    apiBaseUrlPrompt: "Starlens API base URL",
    projectRootDetected: "Detected project root: {0}",
    projectRootConfirmPrompt: "Project path (enter to confirm)",
    projectRootNotFound: "Could not auto-detect a project with `mcp:start` script.",
    projectPathPrompt: "Project path (absolute, must contain mcp:start script)",
    hostedServiceUrl: "✓ Hosted service: {0}",

    // Token
    tokenCreateHint: "Create an API Token (stl_xxx) in Starlens settings, then paste it here.",
    tokenReuseHint: "API Token (press enter to reuse existing token: {0}, or enter a new one)",
    tokenInputHidden: "API Token (input hidden)",
    tokenNotProvided: "⚠  No token provided. Config snippet will show placeholder stl_xxx; replace it manually.",

    // agent.env
    agentEnvExistsPrompt: "~/.starlens/agent.env already exists. Overwrite? (y/N)",
    agentEnvWritten: "✓ Written: {0}",
    agentEnvSkipped: "Skipped writing agent.env.",

    // MCP 配置写入
    mcpConfiguringTitle: "Configuring MCP Server...",
    claudeConfigCommandLabel: "\n  {0} config command:",
    claudeRunNowPrompt: "  Run now? (y/N)",
    claudeRegistered: "  ✓ MCP server registered to {0}.",
    claudeRegisterFailed: "  ✗ Registration failed. Run the command above manually.",
    mcpConfigWritten: "✓ MCP config written: {0}",
    mcpConfigFailed: "⚠  {0}: {1}",

    // Other 客户端片段
    otherClientSnippetTitle: "Manual config snippet for 'Other' clients:",

    // Token 验证
    verifyTokenPrompt: "Verify token validity? (y/N)",
    verifying: "Verifying...",
    tokenVerified: "✓ Token verified, API connection OK.",
    tokenInvalid: "✗ Token invalid (HTTP {0}). Check the token.",
    serverReturnedStatus: "⚠  Server returned HTTP {0}. Check the API base URL.",
    connectFailed: "✗ Could not connect to {0}. Check the service is running.",

    // 跳过 / 完成
    mcpSkipped: "Skipped MCP configuration.",
    setupComplete: "✓ Setup complete!",
    nextStepsTitle: "Next steps:",
    nextStep1: "  1. Restart your AI client so the config takes effect.",
    nextStep2: '  2. In the client, try: "search my starred repos about React" to verify.',
    nextStep3: "  3. Full docs: {0}",
  },

  zh: {
    // Step 0: 语言选择(双语展示,所以只有一份)
    languagePrompt: "Language / 语言:\n  1) English\n  2) 中文",

    // 欢迎与提示 — setup 向导
    wizardTitle: "Starlens 安装向导",
    wizardIntro: "本向导将安装 Agent Skill(通过 npx skills add)并配置 MCP Server。",
    // install-mcp 向导(只配 MCP)
    mcpWizardTitle: "Starlens MCP 配置向导",
    mcpWizardIntro: "本向导将为你的 AI 客户端配置 MCP Server。Skill 安装是独立的(使用 npx skills add)。",

    sourceTip: "提示:你正在从源码运行。要全局使用 `stars`,\n      请先安装:npm install -g @starlens-app/cli",

    // Step 1: 安装 Skill (仅 setup 向导)
    installingSkill: "正在通过 npx skills add 安装 Starlens Agent Skill...",
    skillInstallFailed: "⚠  Skill 安装失败:{0} ({1})",
    skillInstallFailedReason: "命令失败或未找到",
    skillManualHint: "  稍后手动运行:{0}",

    // Step 2: 配置 MCP
    mcpNoSupportedClients: "所选客户端不支持 MCP,跳过 MCP 配置。",
    mcpConfigurePrompt: "配置 MCP Server?(支持 {0}) (y/N)",
    hostedModeFlag: "✓ 托管服务模式 (--hosted)",
    selfHostedModeFlag: "✓ 自托管模式 (--local)",
    deploymentModeTitle: "部署模式:",
    deploymentModeHosted: "  1) 托管(推荐)— 使用 starlens.520ai.xin,无需本地服务",
    deploymentModeSelfHosted: "  2) 自托管 — 你自己的服务器或本地开发环境",
    deploymentModePrompt: "选择模式",
    apiBaseUrlPrompt: "Starlens API 基础地址",
    projectRootDetected: "检测到项目根目录:{0}",
    projectRootConfirmPrompt: "项目路径(回车确认)",
    projectRootNotFound: "未能自动检测到包含 `mcp:start` 脚本的项目。",
    projectPathPrompt: "项目路径(绝对路径,须包含 mcp:start 脚本)",
    hostedServiceUrl: "✓ 托管服务:{0}",

    // Token
    tokenCreateHint: "请在 Starlens 设置中创建 API Token (stl_xxx),然后粘贴到这里。",
    tokenReuseHint: "API Token(回车复用已有 token:{0},或输入新的)",
    tokenInputHidden: "API Token(输入隐藏)",
    tokenNotProvided: "⚠  未提供 token。配置片段将显示占位符 stl_xxx,请手动替换。",

    // agent.env
    agentEnvExistsPrompt: "~/.starlens/agent.env 已存在。覆盖? (y/N)",
    agentEnvWritten: "✓ 已写入:{0}",
    agentEnvSkipped: "已跳过写入 agent.env。",

    // MCP 配置写入
    mcpConfiguringTitle: "正在配置 MCP Server...",
    claudeConfigCommandLabel: "\n  {0} 配置命令:",
    claudeRunNowPrompt: "  立即运行? (y/N)",
    claudeRegistered: "  ✓ MCP server 已注册到 {0}。",
    claudeRegisterFailed: "  ✗ 注册失败。请手动运行上方命令。",
    mcpConfigWritten: "✓ MCP 配置已写入:{0}",
    mcpConfigFailed: "⚠  {0}: {1}",

    // Other 客户端片段
    otherClientSnippetTitle: "'其他' 客户端的手动配置片段:",

    // Token 验证
    verifyTokenPrompt: "验证 token 有效性? (y/N)",
    verifying: "正在验证...",
    tokenVerified: "✓ Token 已验证,API 连接正常。",
    tokenInvalid: "✗ Token 无效 (HTTP {0})。请检查 token。",
    serverReturnedStatus: "⚠  服务器返回 HTTP {0}。请检查 API 基础地址。",
    connectFailed: "✗ 无法连接 {0}。请检查服务是否运行。",

    // 跳过 / 完成
    mcpSkipped: "已跳过 MCP 配置。",
    setupComplete: "✓ 安装完成!",
    nextStepsTitle: "后续步骤:",
    nextStep1: "  1. 重启 AI 客户端使配置生效。",
    nextStep2: '  2. 在客户端中试试:"search my starred repos about React" 验证是否生效。',
    nextStep3: "  3. 完整文档:{0}",
  },
};

// wizardCheckbox 的 UI 原语提示(不进 messages 字典,由调用方传入)
// 这里集中定义,方便 en/zh 复用,保持 prompts.mjs 无 i18n 依赖。
export const checkboxLabels = {
  en: {
    selectPrompt: "Select AI clients (↑↓ move, space toggle, enter confirm):",
    enterNumbersPrompt: "Enter numbers (comma-separated, e.g. 1,2): ",
    noClientSelectedError: "No client selected. Pass --client <names> for non-interactive use.",
    skillOnlyLabel: "[Skill only]",
  },
  zh: {
    selectPrompt: "选择 AI 客户端(↑↓ 移动,空格切换,回车确认):",
    enterNumbersPrompt: "输入序号(逗号分隔,如 1,2): ",
    noClientSelectedError: "未选择客户端。非交互模式请传 --client <names>。",
    skillOnlyLabel: "[仅 Skill]",
  },
};
