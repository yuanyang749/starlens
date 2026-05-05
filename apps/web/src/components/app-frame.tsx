import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Search, Sparkles } from "lucide-react";
import { AppSidebar } from "./app-sidebar";

export function AppFrame({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,#f8fafb,#edf2f5)] text-[color:var(--foreground)]">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[color:var(--line)] bg-[rgba(255,255,255,0.72)] backdrop-blur">
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Starlens
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="hidden rounded-full border border-[color:var(--line)] px-4 py-2 text-sm text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)] sm:inline-flex"
                >
                  Public page
                </Link>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] text-[color:var(--muted)]"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
                {description}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-11 items-center gap-3 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm text-[color:var(--muted)] shadow-[0_12px_32px_rgba(15,23,32,0.04)]">
                  <Search className="h-4 w-4" />
                  Static milestone shell
                </div>
                <div className="flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white">
                  <Sparkles className="h-4 w-4" />
                  Mock data only
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
