import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// 中文注释：站点正式域名，用于解析 OG 图片、canonical 等所有相对 URL。
const SITE_URL = "https://starlens.520ai.xin";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Starlens - GitHub Stars 智能搜索与管理工作台",
    template: "%s | Starlens",
  },
  description:
    "Starlens 是一款开源的 GitHub Stars 智能管理工具，支持自然语言搜索、多级标签、README 摘要和 AI 问答，并提供 CLI、MCP 与 HTTP API，让 Claude Code、Codex 和 Agent 也能直接检索你的收藏。",
  applicationName: "Starlens",
  authors: [{ name: "Starlens", url: "https://github.com/yuanyang749/starlens" }],
  creator: "Starlens",
  keywords: [
    "GitHub Stars",
    "GitHub 收藏管理",
    "Stars 搜索",
    "开源项目搜索",
    "AI 代码助手",
    "Claude Code",
    "Codex",
    "Cursor MCP",
    "MCP 服务器",
    "开源管理工具",
    "Starlens",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    siteName: "Starlens",
    title: "Starlens - 找回你收藏的每一个好项目",
    description:
      "按语义、时间和上下文找回你 Star 过的项目，并让 Claude Code、Codex 和 Agent 也能直接检索你的收藏。开源、可自部署、数据可控。",
    images: [
      {
        url: "/design/starlens-landing-page-concept-9x16.png",
        width: 1440,
        height: 810,
        alt: "Starlens 落地页预览",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Starlens - 找回你收藏的每一个好项目",
    description:
      "按语义、时间和上下文找回你 Star 过的项目，并让 AI 助手也能直接检索你的收藏。",
    images: ["/design/starlens-landing-page-concept-9x16.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("h-full", "font-sans")} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
