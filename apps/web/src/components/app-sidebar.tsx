"use client";

import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  House,
  KeyRound,
  Layers3,
  Search,
  Settings2,
  Star,
  Tag,
} from "lucide-react";

const navItems = [
  { href: "/app", label: "全部 Stars", icon: Search },
  { href: "/app", label: "重点收藏", icon: Star },
  { href: "/app", label: "最近同步", icon: Layers3 },
  { href: "/app", label: "按标签", icon: Tag },
  { href: "/app/providers", label: "AI Provider", icon: Bot },
  { href: "/app/tokens", label: "API Token", icon: KeyRound },
  { href: "/app/general", label: "通用设置", icon: Settings2 },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-[color:var(--line)] bg-[rgba(255,255,255,0.72)] xl:flex xl:flex-col">
      <div className="border-b border-[color:var(--line)] px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo size={40} className="rounded-xl" />
          <div>
            <p className="text-base font-semibold tracking-tight">Starlens</p>
          </div>
        </Link>
      </div>
      <div className="px-4 py-5">
        <div className="rounded-[22px] border border-[color:var(--line)] bg-[rgba(255,255,255,0.72)] p-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/app" && pathname.startsWith(href));

            return (
              <Link
                key={`${href}-${label}`}
                href={href}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                  active
                    ? "bg-[color:var(--accent-soft)] text-[color:var(--foreground)]"
                    : "text-[color:var(--muted)] hover:bg-[rgba(57,95,130,0.08)] hover:text-[color:var(--foreground)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="mt-auto border-t border-[color:var(--line)] px-6 py-5 text-sm text-[color:var(--muted)]">
        <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground)]">
          <House className="h-4 w-4 text-[color:var(--accent)]" />
          公共站点与工作台分离
        </div>
        <p className="leading-7">
          首页负责产品介绍，工作台承载搜索、同步和配置等实际操作流程。
        </p>
      </div>
    </aside>
  );
}
