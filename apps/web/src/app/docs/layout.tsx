import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

// 中文注释：集中维护文档导航，确保顶部导航和侧边目录保持一致。
const docLinks = [
  { href: "/docs", label: "概览" },
  { href: "/docs/features", label: "功能说明" },
  { href: "/docs/architecture", label: "技术架构" },
  { href: "/docs/integrations", label: "对接配置" },
  { href: "/docs/deployment", label: "部署方式" },
];

export const metadata: Metadata = {
  title: "用户文档 | Starlens",
  description: "Starlens 的功能、技术架构和部署方式说明。",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <header className="docs-header">
        <Link href="/" className="docs-brand" aria-label="返回 Starlens 首页">
          <BrandLogo size={30} className="rounded-lg" priority />
          <span>Starlens</span>
        </Link>
        <nav className="docs-top-nav" aria-label="文档导航">
          {docLinks.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/app" className="docs-app-link">
          进入工作台 <ArrowRight className="h-4 w-4" />
        </Link>
      </header>
      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="文档目录">
          <strong>用户文档</strong>
          {docLinks.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </aside>
        <main className="docs-main">
          <article className="docs-content">{children}</article>
        </main>
      </div>
    </div>
  );
}
