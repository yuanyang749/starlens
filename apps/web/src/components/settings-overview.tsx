import Link from "next/link";
import { ArrowRight, Bot, KeyRound, LayoutPanelLeft, Server } from "lucide-react";

const cards = [
  {
    href: "/app/settings/ai",
    title: "AI providers",
    body: "Configure Gateway, OpenAI-compatible, Anthropic, or Gemini endpoints with validation and defaults.",
    icon: Bot,
  },
  {
    href: "/app/settings/tokens",
    title: "CLI and agent tokens",
    body: "Issue scoped personal tokens for the terminal and automation surfaces without exposing GitHub OAuth state.",
    icon: KeyRound,
  },
  {
    href: "/app",
    title: "Workspace shell",
    body: "Return to the workbench and keep the static list-detail flow grounded while the live data layer comes next.",
    icon: LayoutPanelLeft,
  },
];

export function SettingsOverview() {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
      <section className="app-panel rounded-[24px] p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
          <Server className="h-4 w-4 text-[color:var(--accent)]" />
          Configuration domain
        </div>
        <p className="max-w-xl text-sm leading-7 text-[color:var(--muted)]">
          This area stays intentionally narrow: provider setup, token issuance,
          and the minimum surfaces needed to support future GitHub and AI
          wiring without rethinking navigation.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ href, title, body, icon: Icon }) => (
          <Link
            key={title}
            href={href}
            className="app-panel flex min-h-56 flex-col justify-between rounded-[24px] p-5 transition hover:border-[color:var(--accent)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
                {body}
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
              Open
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
