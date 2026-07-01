import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: "用户文档 | Starlens",
  description: "Starlens 的功能、技术架构和部署方式说明。",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell docs-shell--with-sidebar">
      <header className="docs-header">
        <Link href="/" className="docs-brand" aria-label="返回 Starlens 首页">
          <BrandLogo size={30} className="rounded-lg" priority />
          <span>Starlens</span>
        </Link>
        <DocsNav variant="top" />
        <Link href="/app" className="docs-app-link">
          进入工作台 <ArrowRight className="h-4 w-4" />
        </Link>
      </header>
      <div className="docs-layout">
        <DocsNav variant="sidebar" />
        <main className="docs-main">
          <article className="docs-content">{children}</article>
        </main>
      </div>
    </div>
  );
}
