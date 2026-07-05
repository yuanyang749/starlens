"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { BrandLogo } from "./brand-logo";
import ClickSpark from "./click-spark";
import { LandingInteractions } from "./landing-interactions";
import { LandingScrollAnimations } from "./landing-scroll-animations";
import { LandingHeader } from "./landing-header";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Database,
  FileText,
  Github,
  GitMerge,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  TerminalSquare,
  Volume2,
  VolumeX,
} from "lucide-react";
import { GitHubSignInButton } from "./github-sign-in-button";

// 中文注释：痛点内容直接承接用户真实使用场景，避免落地页只停留在功能罗列。
const painCards = [
  {
    title: "Star 太多，想用时想不起名字",
    body: "只隐约记得它是一个 React 表格或 Agent 框架，但死活想不起具体的仓库名称或关键字。",
    proof: "支持通过自然语言、多级标签、README 摘要和个人备注，帮您快速找回模糊的记忆。",
    icon: Search,
  },
  {
    title: "最近 Star 了什么，很快就断片",
    body: "GitHub 原生收藏只有一长串列表，几天不看就完全忘记了当时为什么要 Star 这个项目。",
    proof: "提供最近收藏、编程语言、Stars 数量和整理状态等维度过滤，让新收藏不再迷失。",
    icon: Star,
  },
  {
    title: "Claude Code、Codex 和 Agent 查不到你的收藏",
    body: "当开发工具需要上下文时，收藏的项目仍躺在浏览器里，AI 助手无法直接检索和使用它们。",
    proof: "提供 CLI 工具、Cursor MCP 和 HTTP API，让 AI 助手也能随时检索和调用你的 Stars。",
    icon: Bot,
  },
];

const featureCards = [
  {
    title: "精准搜索与过滤",
    body: "支持关键词、语言、Stars 和更新时间等多维过滤，帮你快速从万千收藏中定位目标项目。",
    chips: ["关键词搜索", "多维过滤", "智能排序"],
    icon: Search,
    mock: "filters",
  },
  {
    title: "标签、备注、收藏",
    body: "通过多级标签体系、个性化备注和分类收藏夹，构建一套井井有条的个人开源项目知识库。",
    chips: ["多级标签", "个人备注", "收藏管理"],
    icon: Tags,
    mock: "notes",
  },
  {
    title: "AI 助手理解项目",
    body: "利用 AI 自动提炼项目要点、分析潜在风险并总结 README，帮你在几秒钟内读懂项目。",
    chips: ["项目摘要", "对比分析", "智能问答"],
    icon: Bot,
    mock: "ai",
  },
];

const providerCards = [
  {
    name: "OpenAI 兼容",
    body: "完美兼容 OpenAI 接口规范，支持接入各大兼容厂商的服务。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
    chips: ["兼容广泛", "易于接入"],
  },
  {
    name: "Anthropic",
    body: "支持 Anthropic 原生接口，可调用性能强大的 Claude 模型。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/anthropic.svg",
    chips: ["原生协议", "安全可靠"],
  },
  {
    name: "Gemini",
    body: "支持 Google Gemini 原生接口，利用多模态及超长上下文优势。",
    logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlegemini.svg",
    chips: ["原生协议", "多模态"],
  },
  {
    name: "DeepSeek",
    body: "支持 DeepSeek 原生接口，调用性价比极高的高性能对话模型。",
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
  { title: "产品", links: [["功能", "/docs/features"], ["定价（未来）", "#"], ["更新日志", "/changelog"]] },
  { title: "资源", links: [["文档", "/docs"], ["隐私政策", "/privacy"], ["使用条款", "/terms"]] },
  { title: "社区", links: [["GitHub", "https://github.com/yuanyang749/starlens"], ["讨论区", "https://github.com/yuanyang749/starlens/issues"], ["贡献指南", "https://github.com/yuanyang749/starlens/blob/main/CONTRIBUTING.md"]] },
];

const primaryLoginLinkClassName =
  "landing-button landing-button--primary h-14 px-6 text-sm font-semibold";

const secondaryLinkClassName =
  "landing-button landing-button--secondary h-14 px-6 text-sm font-semibold";



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
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText("npm install -g @starlens-app/cli");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  return (
    <ClickSpark
      sparkColor="#000000"
      sparkSize={12}
      sparkRadius={20}
      sparkCount={10}
      duration={500}
      extraScale={1.2}
    >
      <div className="landing-page min-h-screen">
        <LandingInteractions />
        <LandingScrollAnimations />
        <LandingHeader githubAuthEnabled={githubAuthEnabled} />

      <main>
        <section id="hero" className="landing-hero landing-section">
          <div className="landing-hero__copy">
            <a
              href="https://forum.trae.cn/t/topic/70912"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-contest-banner"
              aria-label="前往 TRAE AI 创造力大赛为 Starlens 投票"
            >
              <div className="landing-contest-banner__badge">
                <span>TRAE AI 大赛</span>
              </div>
              <div className="landing-contest-banner__text">
                Starlens 正在参加“TRAE AI 创造力大赛”！如果它帮到了你，请为我投票 💜
              </div>
              <div className="landing-contest-banner__go">
                <span>去投票</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </a>

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

            <div className="landing-hero__cli">
              <div className="landing-hero__cli-inner" onClick={handleCopy}>
                <TerminalSquare className="h-4 w-4 landing-hero__cli-icon" />
                <span className="landing-hero__cli-code">
                  npm install -g @starlens-app/cli
                </span>
                <button
                  type="button"
                  className="landing-hero__cli-copy"
                  aria-label="复制安装命令"
                >
                  {copied ? "已复制！" : "复制"}
                </button>
              </div>
              <p className="landing-hero__cli-tip">
                安装后运行 <code>stars install-skill</code> 即可一键对接你的 AI 助手
              </p>
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

          <a href="#pain" className="landing-hero__scroll-hint" aria-label="向下滚动">
            <span>向下滚动</span>
            <ChevronDown className="h-5 w-5" />
          </a>
        </section>

        <section id="demo" className="landing-section landing-demo landing-block">
          <div className="landing-section-heading">
            <p className="landing-pill">产品演示</p>
            <h2>1 分钟看懂 Starlens</h2>
            <p>从 CLI 检索、自然语言提问，到 Claude Code 通过 MCP 自动整理收藏，完整流程一镜到底。</p>
          </div>
          <div className="landing-demo__stage">
            <div className="landing-demo__aura" aria-hidden="true" />
            <div className="landing-demo__frame">
              <div className="landing-demo__screen">
                <video
                  ref={videoRef}
                  className="landing-demo__video"
                  src="/demo/starlens-demo.mp4"
                  autoPlay
                  muted={isMuted}
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="Starlens 产品演示视频"
                />
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`landing-demo__audio-toggle ${!isMuted ? "landing-demo__audio-toggle--active" : ""}`}
                  aria-label={isMuted ? "开启语音旁白解说" : "静音"}
                  title={isMuted ? "开启语音旁白解说" : "静音"}
                >
                  {isMuted ? (
                    <VolumeX className="landing-demo__audio-icon text-slate-200" />
                  ) : (
                    <Volume2 className="landing-demo__audio-icon text-emerald-400" />
                  )}
                </button>
              </div>
            </div>
            <Star className="landing-demo__spark landing-demo__spark--1" aria-hidden="true" />
            <Star className="landing-demo__spark landing-demo__spark--2" aria-hidden="true" />
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
                  <div className="landing-feature-card__header">
                    <Icon className="h-5 w-5" />
                    <h3>{title}</h3>
                  </div>
                  <p>{body}</p>
                  <div className="landing-feature-card__chips">
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
              <p>提供直观的可视化操作界面，支持快捷搜索、打标签与备注，方便日常浏览和管理。</p>
              <div className="landing-workflow-card__image-container">
                <Image
                  src="/design/starlens-workbench-concept-21x9.png"
                  alt="Starlens Web 工作台截图"
                  fill
                  sizes="(min-width: 1024px) 30vw, 100vw"
                  style={{ objectFit: "contain" }}
                />
              </div>
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
              <p>支持 HTTP API 直连与 Cursor/IDE MCP 协议，让各种 AI 智能体也能轻松检索。</p>
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
                <div className="landing-provider-card__header">
                  <Image
                    src={provider.logoUrl}
                    alt={provider.name}
                    width={28}
                    height={28}
                    className="landing-provider-logo"
                  />
                  <h3>{provider.name}</h3>
                </div>
                <p>{provider.body}</p>
                <div className="landing-provider-card__chips">
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
              <p>项目代码完全开源，所有逻辑均透明可审计，欢迎社区共同建设与贡献。</p>
              <a href="https://github.com/yuanyang749/starlens" target="_blank" rel="noreferrer">
                查看 GitHub 仓库 <ArrowRight className="h-4 w-4" />
              </a>
            </article>
            <article>
              <Database className="h-9 w-9" />
              <h3>数据由你掌控</h3>
              <p>使用你自己的 PostgreSQL 数据库，所有项目、标签和备注完全由你掌控。</p>
              <a href="/docs/architecture">
                了解数据库模型 <ArrowRight className="h-4 w-4" />
              </a>
            </article>
            <article>
              <Cloud className="h-9 w-9" />
              <h3>灵活部署</h3>
              <p>支持 Docker 容器化一键部署，也支持在各种环境中直接运行 Node.js。</p>
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
          <span>© 2026 Starlens. All rights reserved.</span>
        </div>
        <div className="landing-footer__links">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <strong>{column.title}</strong>
              {column.links.map(([item, href]) => {
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
          <GitHubSignInButton
            githubAuthEnabled={githubAuthEnabled}
            className="landing-button landing-button--primary h-10 px-4 text-xs font-semibold"
          >
            <Github className="h-4 w-4" />
            进入工作台
          </GitHubSignInButton>
        </div>
        </footer>
      </div>
    </ClickSpark>
  );
}
