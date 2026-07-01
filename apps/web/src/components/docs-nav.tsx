"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const docLinks = [
  { href: "/docs", label: "概览" },
  { href: "/docs/features", label: "功能说明" },
  { href: "/docs/architecture", label: "技术架构" },
  { href: "/docs/integrations", label: "对接配置" },
  { href: "/docs/deployment", label: "部署方式" },
];

export function DocsNav({ variant }: { variant: "top" | "sidebar" }) {
  const pathname = usePathname();

  if (variant === "top") {
    return (
      <nav className="docs-top-nav" aria-label="文档导航">
        {docLinks.map((item) => {
          const active = pathname === item.href;
          return (
            <Link href={item.href} key={item.href} className={active ? "active" : ""}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <aside className="docs-sidebar" aria-label="文档目录">
      <strong>用户文档</strong>
      {docLinks.map((item) => {
        const active = pathname === item.href;
        return (
          <Link href={item.href} key={item.href} className={active ? "active" : ""}>
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
