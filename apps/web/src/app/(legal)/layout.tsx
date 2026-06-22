import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "Starlens",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <header className="docs-header">
        <Link href="/" className="docs-brand" aria-label="返回 Starlens 首页">
          <BrandLogo size={30} className="rounded-lg" priority />
          <span>Starlens</span>
        </Link>
        <nav className="docs-top-nav" aria-label="页面导航">
          <Link href="/docs">文档</Link>
          <Link href="/changelog">更新日志</Link>
          <Link href="/privacy">隐私政策</Link>
          <Link href="/terms">使用条款</Link>
        </nav>
        <Link href="/app" className="docs-app-link">
          进入工作台 <ArrowRight className="h-4 w-4" />
        </Link>
      </header>
      <div className="docs-layout">
        <main className="docs-main" style={{ gridColumn: "1 / -1" }}>
          <article className="docs-content">{children}</article>
        </main>
      </div>
    </div>
  );
}
