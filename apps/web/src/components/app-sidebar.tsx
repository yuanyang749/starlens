"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  House,
  KeyRound,
  Layers3,
  Search,
  Settings2,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";

const navItems = [
  { href: "/app", label: "All stars", icon: Search },
  { href: "/app", label: "Favorites", icon: Star },
  { href: "/app", label: "Recent", icon: Layers3 },
  { href: "/app", label: "By tag", icon: Tag },
  { href: "/app/settings", label: "Settings", icon: Settings2 },
  { href: "/app/settings/ai", label: "AI providers", icon: Bot },
  { href: "/app/settings/tokens", label: "Tokens", icon: KeyRound },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-[color:var(--line)] bg-[rgba(255,255,255,0.72)] xl:flex xl:flex-col">
      <div className="border-b border-[color:var(--line)] px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] text-[color:var(--accent)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">Starlens</p>
            <p className="text-sm text-[color:var(--muted)]">Static milestone shell</p>
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
          Public and app split
        </div>
        <p className="leading-7">
          `/` stays public and product-facing while `/app` holds the real workspace flow.
        </p>
      </div>
    </aside>
  );
}
