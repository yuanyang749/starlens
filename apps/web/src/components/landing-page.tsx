import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import ClickSpark from "./click-spark";
import { LandingInteractions } from "./landing-interactions";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  Github,
  GitMerge,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  TerminalSquare,
} from "lucide-react";
import { GitHubSignInButton } from "./github-sign-in-button";

const navItems = [
  { href: "#pain", label: "痛点" },
  { href: "#features", label: "功能" },
  { href: "#workflow", label: "工作方式" },
  { href: "#providers", label: "AI 与协议" },
  { href: "#deploy", label: "开源与自部署" },
  { href: "/docs", label: "文档" },
];

// 中文注释：痛点内容直接承接用户真实使用场景，避免落地页只停留在功能罗列。
const painCards = [
  {
    title: "Star 太多，想用时想不起名字",
    body: "你可能记得它是一个 React 表格、一个 Agent 框架、一个部署工具，但就是想不起仓库名、作者名或准确关键词。",
    proof: "用自然语言、标签、README 摘要和个人备注，把模糊记忆重新映射到具体仓库。",
    icon: Search,
  },
  {
    title: "最近 Star 了什么，很快就断片",
    body: "GitHub 原生收藏更像时间线和列表，过几天再回头，很难快速回忆最近收藏的项目为什么值得看。",
    proof: "按最近 Star、语言、主题、Stars 和整理状态筛选，让新收藏及时进入你的工作流。",
    icon: Star,
  },
  {
    title: "Claude Code、Codex 和 Agent 查不到你的收藏",
    body: "开发工具需要上下文时，GitHub Stars 仍然躺在浏览器里，Agent 无法直接把你收藏过的项目变成可调用知识。",
    proof: "通过 CLI、HTTP API、Cursor MCP 和个人 token，让开发工具也能检索、引用、整理你的 Stars。",
    icon: Bot,
  },
];

const featureCards = [
  {
    title: "精准搜索与过滤",
    body: "支持关键词、语言、Stars、更新时间的多维过滤，快速定位你需要的项目。",
    chips: ["关键词搜索", "多维过滤", "智能排序"],
    icon: Search,
    mock: "filters",
  },
  {
    title: "标签、备注、收藏",
    body: "用标签体系、个人备注和收藏夹，构建属于你自己的项目知识库。",
    chips: ["多级标签", "个人备注", "收藏管理"],
    icon: Tags,
    mock: "notes",
  },
  {
    title: "AI 助手理解项目",
    body: "AI 帮你提炼项目要点、对比候选、总结 README，让你更快判断是否值得深入。",
    chips: ["项目摘要", "对比分析", "智能问答"],
    icon: Bot,
    mock: "ai",
  },
];

const providerCards = [
  {
    name: "OpenAI 兼容",
    body: "兼容 OpenAI API 协议，可接入各类 OpenAI 兼容服务。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
    chips: ["兼容广泛", "易于接入"],
  },
  {
    name: "Anthropic",
    body: "支持 Anthropic 原生协议，使用 Claude 系列模型。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/anthropic.svg",
    chips: ["原生协议", "安全可靠"],
  },
  {
    name: "Gemini",
    body: "支持 Gemini 原生协议，使用 Google Gemini 模型。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlegemini.svg",
    chips: ["原生协议", "多模态"],
  },
  {
    name: "DeepSeek",
    body: "支持 DeepSeek 原生协议，使用 DeepSeek 系列推理与对话模型。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/deepseek.svg",
    chips: ["原生协议", "高性价比"],
  },
];

const proofItems = [
  { label: "找回忘记名字的仓库", icon: Search },
  { label: "看见最近 Star 的线索", icon: CheckCircle2 },
  { label: "给 Agent 与开发工具使用", icon: Sparkles },
];

const footerColumns = [
  { title: "产品", links: ["功能", "定价（未来）", "更新日志"] },
  { title: "资源", links: ["文档", "隐私政策", "使用条款"] },
  { title: "社区", links: ["GitHub", "讨论区", "贡献指南"] },
];

function footerLinkHref(item: string) {
  const map: Record<string, string> = {
    "功能": "/docs/features",
    "定价（未来）": "#",
    "更新日志": "/changelog",
    "文档": "/docs",
    "隐私政策": "/privacy",
    "使用条款": "/terms",
    "GitHub": "https://github.com/yuanyang749/starlens",
    "讨论区": "https://github.com/yuanyang749/starlens/issues",
    "贡献指南": "https://github.com/yuanyang749/starlens/blob/main/CONTRIBUTING.md",
  };

  return map[item] ?? "#";
}

const primaryLoginLinkClassName =
  "landing-button landing-button--primary h-14 px-6 text-sm font-semibold";

const secondaryLinkClassName =
  "landing-button landing-button--secondary h-14 px-6 text-sm font-semibold";

function WorkspaceLink({
  children,
  className,
  githubAuthEnabled,
}: {
  children: ReactNode;
  className: string;
  githubAuthEnabled: boolean;
}) {
  if (!githubAuthEnabled) {
    return (
      <span
        title="当前本地环境尚未配置 GitHub OAuth。"
        className={`${className} cursor-not-allowed opacity-55`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link href="/app" className={className}>
      {children}
    </Link>
  );
}

function MiniRepoList() {
  const repos = [
    ["microsoft / AutoGen", "AI Agent · Multi-Agent", "18.2k"],
    ["vercel / next.js", "React · Framework", "121k"],
    ["sindresorhus / ky", "HTTP · Fetch", "16.3k"],
    ["docker / docker", "DevOps · Container", "75.1k"],
    ["tanstack / query", "React · Data", "34.7k"],
    ["leafac / leaf", "Project Management", "8.3k"],
  ];

  return (
    <div className="landing-product-list">
      {repos.map(([name, meta, stars], index) => (
        <div className="landing-product-row" key={name}>
          <span className="landing-radio" />
          <div>
            <strong>{name}</strong>
            <p>{meta}</p>
          </div>
          <span>{stars} ★</span>
          <i style={{ animationDelay: `${index * 180}ms` }} />
        </div>
      ))}
    </div>
  );
}

function ProductPreview() {
  const thumbnails = ["搜索", "过滤", "详情", "打标签", "备注", "AI"];

  return (
    <div className="landing-preview landing-float-card">
      <div className="landing-preview__shell">
        <aside className="landing-preview__sidebar">
          <div className="landing-preview__brand">
            <BrandLogo size={20} className="rounded-md" />
            <span>Starlens</span>
          </div>
          {["搜索", "项目", "标签", "收藏", "AI 助手", "设置"].map((item, index) => (
            <span className={index === 0 ? "is-active" : ""} key={item}>
              <Search className="h-3.5 w-3.5" />
              {item}
            </span>
          ))}
          <div className="landing-preview__legend">
            <p>标签</p>
            {["AI", "Tool", "Frontend", "Backend", "Library"].map((item, index) => (
              <span key={item}>
                <i style={{ background: ["#6366f1", "#ec4899", "#f97316", "#22c55e", "#0ea5e9"][index] }} />
                {item}
                <b>{[152, 90, 86, 61, 42][index]}</b>
              </span>
            ))}
          </div>
        </aside>
        <section className="landing-preview__main">
          <div className="landing-preview__topbar">
            <div className="landing-searchbar">搜索你的 stars...</div>
            <span />
            <span />
            <span className="landing-avatar" />
          </div>
          <div className="landing-preview__filters">
            <span>语言: TypeScript</span>
            <span>最小 Stars: 1000</span>
            <span>排序: Stars</span>
          </div>
          <MiniRepoList />
        </section>
        <aside className="landing-preview__detail">
          <div className="landing-detail-card">
            <span>microsoft / AutoGen</span>
            <b>18.2k</b>
            <p>A programming framework for building AI agents and applications.</p>
            <div>
              <em>AI</em>
              <em>Agent</em>
              <em>Multi-Agent</em>
            </div>
          </div>
          <div className="landing-readme-card">
            <strong>README 摘要</strong>
            <p>多智能体框架，适合构建复杂自动化流程与 Agent 协作。</p>
            <button type="button">在 GitHub 中查看</button>
          </div>
        </aside>
      </div>
      <div className="landing-timeline">
        <button type="button" aria-label="播放静音演示">
          <Play className="h-6 w-6 fill-current" />
        </button>
        {thumbnails.map((item) => (
          <span key={item}>{item}</span>
        ))}
        <p>静音演示：搜索 → 过滤 → 查看详情 → 打标签 → 写备注</p>
        <time>00:00 / 00:12</time>
      </div>
    </div>
  );
}

function FeatureMock({ type }: { type: string }) {
  if (type === "filters") {
    return (
      <div className="landing-card-mock landing-card-mock--filters">
        <div>stars...</div>
        <span>语言: Rust</span>
        <span>最小 Stars: 1000</span>
        <span>排序: Stars</span>
      </div>
    );
  }

  if (type === "notes") {
    return (
      <div className="landing-card-mock landing-card-mock--notes">
        <div>
          <strong>延迟修复</strong>
          <span>2次</span>
        </div>
        <div>
          <strong>Airbnb / 组件库</strong>
          <p>用于收藏组件、路由与状态管理。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-card-mock landing-card-mock--ai">
      <div>
        <Sparkles className="h-4 w-4" />
        <span>为我总结这个项目是否适合 Agent 工作流。</span>
      </div>
      <p>提炼用途、风险、依赖和 README 关键点。</p>
    </div>
  );
}

export function LandingPage({ githubAuthEnabled = true }: { githubAuthEnabled?: boolean }) {
  return (
    <ClickSpark
      sparkColor="#000"
      sparkSize={10}
      sparkRadius={16}
      sparkCount={8}
      duration={400}
      extraScale={1}
    >
      <div className="landing-page min-h-screen overflow-x-hidden">
        <LandingInteractions />
        <header className="landing-header">
        <div className="landing-header__inner">
          <Link href="/" className="landing-brand" aria-label="Starlens 首页">
            <BrandLogo size={30} className="rounded-lg" priority />
            <span>Starlens</span>
          </Link>
          <nav className="landing-nav" aria-label="落地页导航">
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="landing-header__actions">
            <div className="landing-auth-wrapper">
              <GitHubSignInButton
                githubAuthEnabled={githubAuthEnabled}
                className="landing-button-circle"
                disabledTitle="当前本地环境尚未配置 GitHub OAuth。"
              >
                <div className="landing-button-circle__inner">
                  <Github className="h-5 w-5" />
                  <span className="landing-button-circle__text">登录</span>
                </div>
              </GitHubSignInButton>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="landing-hero landing-section">
          <div className="landing-hero__copy">
            <p className="landing-kicker">
              <Star className="h-4 w-4 fill-current" />
              你的 GitHub Stars 智能搜索与管理中心
            </p>
            <h1>
              <span className="landing-hero-title-main">找回你收藏的每一个</span>
              <span>好项目</span>
            </h1>
            <p className="landing-hero__lead">
              你 Star 过很多仓库，但真正要用时往往只记得用途、不记得名字。Starlens 帮你按语义、时间和上下文找回项目，并让 Claude Code、Codex 和 Agent 也能直接检索你的收藏。
            </p>
            <div className="landing-hero__actions">
              <GitHubSignInButton
                githubAuthEnabled={githubAuthEnabled}
                className={primaryLoginLinkClassName}
              >
                <Github className="h-5 w-5" />
                使用 GitHub 登录
              </GitHubSignInButton>
              <a
                href="https://github.com/yuanyang749/starlens"
                target="_blank"
                rel="noreferrer"
                className={secondaryLinkClassName}
              >
                <GitMerge className="h-5 w-5" />
                查看 GitHub 仓库
              </a>
            </div>
            <div className="landing-proof-row" aria-label="产品特性">
              {proofItems.map(({ label, icon: Icon }) => (
                <span key={label}>
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="landing-hero__visual" aria-label="Starlens 产品预览">
            <ProductPreview />
          </div>
        </section>

        <section id="pain" className="landing-section landing-pain landing-block">
          <div className="landing-section-heading">
            <p className="landing-pill">核心痛点</p>
            <h2>GitHub Stars 收藏越多，找回越难</h2>
            <p>Starlens 解决的不是“再做一个收藏夹”，而是把你已经 Star 过的项目重新变成可搜索、可理解、可被开发工具调用的上下文。</p>
          </div>
          <div className="landing-pain-grid">
            {painCards.map(({ title, body, proof, icon: Icon }) => (
              <article className="landing-pain-card landing-hover-card" key={title}>
                <div className="landing-pain-card__icon">
                  <Icon className="h-6 w-6" />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
                <span>{proof}</span>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="landing-section landing-block">
          <div className="landing-section-heading">
            <p className="landing-pill">核心能力</p>
            <h2>让你的 Stars 真正为你所用</h2>
            <p>从检索、整理到理解，打造你的高效项目知识库。</p>
          </div>
          <div className="landing-feature-grid">
            {featureCards.map(({ title, body, chips, icon: Icon, mock }) => (
              <article className="landing-feature-card landing-hover-card" key={title}>
                <FeatureMock type={mock} />
                <div className="landing-feature-card__body">
                  <Icon className="h-5 w-5" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <div>
                    {chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="landing-section landing-block">
          <div className="landing-section-heading">
            <p className="landing-pill">工作方式</p>
            <h2>一套能力，多种入口</h2>
            <p>Web、CLI、Agent 共享同一数据与能力，适合人和自动化工作流。</p>
          </div>
          <div className="landing-workflow-grid">
            <article className="landing-workflow-card landing-hover-card">
              <h3>Web 工作台</h3>
              <p>可视化搜索与整理，适合日常浏览与管理。</p>
              <Image
                src="/design/starlens-workbench-concept-21x9.png"
                alt="Starlens Web 工作台截图"
                width={840}
                height={360}
                sizes="(min-width: 1024px) 30vw, 100vw"
              />
            </article>
            <article className="landing-terminal-card landing-hover-card">
              <div className="landing-terminal-card__title">
                <TerminalSquare className="h-5 w-5" />
                CLI
              </div>
              <pre>{`$ stars search "ai agent" --limit 5
Searching your stars...
1. microsoft/autogen         18.2k ★
2. langchain-ai/langchain    17.6k ★
3. openai/openai-cookbook    15.2k ★
4. crewAIInc/crewAI           9.9k ★
5. huggingface/transformers  89.0k ★

$ stars tag add microsoft/autogen AI
$ stars note add microsoft/autogen "多代理框架"`}</pre>
            </article>
            <article className="landing-agent-card landing-hover-card">
              <h3>Agent 集成</h3>
              <p>Agent 通过 HTTP API 直连 Starlens，终端 coding CLI、Cursor 和 IDE 通过 MCP 使用同一组能力。</p>
              {["Claude Code / Codex / opencode", "Starlens HTTP API", "Cursor MCP"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </article>
          </div>
        </section>

        <section id="providers" className="landing-section landing-block">
          <div className="landing-section-heading">
            <p className="landing-pill">AI 与协议支持</p>
            <h2>选择你信任的 AI 服务</h2>
            <p>Starlens 不锁定模型或平台，你可以自由选择最适合的 AI 服务。</p>
          </div>
          <div className="landing-provider-grid">
            {providerCards.map((provider) => (
              <article className="landing-provider-card landing-hover-card" key={provider.name}>
                <div>
                  <img
                    src={provider.logoUrl}
                    alt={provider.name}
                    width={28}
                    height={28}
                    className="landing-provider-logo"
                  />
                  <h3>{provider.name}</h3>
                </div>
                <p>{provider.body}</p>
                <div>
                  {provider.chips.map((chip) => (
                    <em key={chip}>{chip}</em>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="landing-security-note">
            <ShieldCheck className="h-5 w-5" />
            你的 API Key 由你保管，Starlens 不会存储或泄露你的密钥。
          </p>
        </section>

        <section id="deploy" className="landing-section landing-deploy">
          <div className="landing-section-heading">
            <p className="landing-pill">开源与自部署</p>
            <h2>开源、可自部署、数据可控</h2>
            <p>Starlens 完全开源，你可以部署在任何信任的 Docker 或 Node.js 运行环境中。</p>
          </div>
          <div className="landing-deploy-grid">
            <article>
              <Github className="h-9 w-9" />
              <h3>完全开源</h3>
              <p>代码完全开源，透明可审计，欢迎贡献与共建。</p>
              <a href="https://github.com/yuanyang749/starlens" target="_blank" rel="noreferrer">
                查看 GitHub 仓库 <ArrowRight className="h-4 w-4" />
              </a>
            </article>
            <article>
              <Database className="h-9 w-9" />
              <h3>数据由你掌控</h3>
              <p>使用你自己的 PostgreSQL，项目、标签、备注和配置都在你的环境中。</p>
              <a href="/docs/architecture">
                了解数据库模型 <ArrowRight className="h-4 w-4" />
              </a>
            </article>
            <article>
              <Cloud className="h-9 w-9" />
              <h3>灵活部署</h3>
              <p>支持 Docker 自托管部署，也支持直接运行 Node.js 服务。</p>
              <a href="/docs/deployment">
                查看部署文档 <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          </div>
        </section>
      </main>

      <footer id="docs" className="landing-footer">
        <div className="landing-footer__brand">
          <div>
            <BrandLogo size={30} className="rounded-lg" />
            <strong>Starlens</strong>
          </div>
          <p>从收藏到理解，让好项目真正为你所用。</p>
          <span>© 2025 Starlens. All rights reserved.</span>
        </div>
        <div className="landing-footer__links">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <strong>{column.title}</strong>
              {column.links.map((item) => {
                const href = footerLinkHref(item);
                const isExternal = href.startsWith("http");
                const isDisabled = href === "#";
                return (
                  <a
                    href={isDisabled ? undefined : href}
                    key={item}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    aria-disabled={isDisabled || undefined}
                    style={isDisabled ? { opacity: 0.4, cursor: "default", pointerEvents: "none" } : undefined}
                  >
                    {item}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="landing-footer__cta">
          <FileText className="h-5 w-5" />
          <strong>开始使用 Starlens</strong>
          <p>使用 GitHub 登录，搜索你的 Stars。</p>
          <WorkspaceLink
            githubAuthEnabled={githubAuthEnabled}
            className="landing-button landing-button--primary h-10 px-4 text-xs font-semibold"
          >
            <Github className="h-4 w-4" />
            进入工作台
          </WorkspaceLink>
        </div>
        </footer>
      </div>
    </ClickSpark>
  );
}
