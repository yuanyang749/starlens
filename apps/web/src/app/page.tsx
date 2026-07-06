import { LandingPage } from "@/components/landing-page";

export const dynamic = "force-dynamic";

// 中文注释：SoftwareApplication 结构化数据，提升搜索引擎富媒体结果命中率。
// 字段遵循 schema.org 规范，描述产品名称、定位、免费开源、支持的操作系统与功能特性。
const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Starlens",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web, Cross-platform (Node.js, Docker)",
  description:
    "开源的 GitHub Stars 智能搜索与管理工作台，支持自然语言搜索、多级标签、README 摘要、AI 问答，并提供 CLI、MCP 与 HTTP API 供 Claude Code、Codex 和 Agent 调用。",
  url: "https://starlens.520ai.xin",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "CNY",
  },
  isAccessibleForFree: true,
  featureList: [
    "GitHub Stars 自然语言搜索",
    "多级标签与个人备注",
    "README 自动摘要",
    "AI 项目问答与对比分析",
    "CLI 工具（stars 命令）",
    "Cursor MCP 集成",
    "HTTP API 与 Agent 集成",
    "开源、可自部署、数据可控",
  ],
  author: {
    "@type": "Organization",
    name: "Starlens",
    url: "https://github.com/yuanyang749/starlens",
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd) }}
      />
      <LandingPage
        githubAuthEnabled={Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)}
      />
    </>
  );
}
