"use client";

import Link from "next/link";
import { ArrowRight, Bot, KeyRound, LayoutPanelLeft, Server, type LucideIcon } from "lucide-react";

type SettingsCardId = "settings-ai" | "settings-tokens" | "repos";

const cards: Array<{
  id: SettingsCardId;
  href: string;
  title: string;
  body: string;
  icon: LucideIcon;
}> = [
  {
    id: "settings-ai",
    href: "/app/settings/ai",
    title: "AI providers",
    body: "Configure Gateway, OpenAI-compatible, Anthropic, or Gemini endpoints with validation and defaults.",
    icon: Bot,
  },
  {
    id: "settings-tokens",
    href: "/app/settings/tokens",
    title: "CLI and agent tokens",
    body: "Issue scoped personal tokens for the terminal and automation surfaces without exposing GitHub OAuth state.",
    icon: KeyRound,
  },
  {
    id: "repos",
    href: "/app",
    title: "Workspace shell",
    body: "Return to the workbench and keep the static list-detail flow grounded while the live data layer comes next.",
    icon: LayoutPanelLeft,
  },
];

type SettingsOverviewProps = {
  onOpenWorkspace?: () => void;
  onOpenAiProviders?: () => void;
  onOpenTokens?: () => void;
};

export function SettingsOverview({
  onOpenWorkspace,
  onOpenAiProviders,
  onOpenTokens,
}: SettingsOverviewProps) {
  const actions = {
    repos: onOpenWorkspace,
    "settings-ai": onOpenAiProviders,
    "settings-tokens": onOpenTokens,
  } as const;

  return (
    <div data-testid="settings-overview" className="flex flex-col gap-5">
      <section data-testid="settings-overview-intro" className="app-panel rounded-[24px] p-6 md:p-7">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
          <Server className="h-4 w-4 text-[color:var(--accent)]" />
          Configuration domain
        </div>
        <p className="max-w-3xl text-sm leading-7 text-[color:var(--muted)] md:text-[0.95rem]">
          This area stays intentionally narrow: provider setup, token issuance,
          and the minimum surfaces needed to support future GitHub and AI
          wiring without rethinking navigation.
        </p>
      </section>
      <section
        data-testid="settings-overview-cards"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cards.map(({ id, href, title, body, icon: Icon }) => {
          const onOpen = actions[id];

          if (onOpen) {
            return (
              <button
                key={title}
                data-testid="settings-overview-card"
                type="button"
                onClick={onOpen}
                className="app-panel flex min-h-[240px] flex-col rounded-[24px] p-5 text-left transition hover:border-[color:var(--accent)] md:min-h-[260px]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-6 flex flex-1 flex-col">
                  <h2 className="text-[1.75rem] font-semibold leading-[1.05] tracking-tight md:text-[1.95rem]">
                    {title}
                  </h2>
                  <p className="mt-4 max-w-[28ch] text-sm leading-8 text-[color:var(--muted)] md:text-[0.95rem]">
                    {body}
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                  Open
                  <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            );
          }

          return (
            <Link
              key={title}
              href={href}
              data-testid="settings-overview-card"
              className="app-panel flex min-h-[240px] flex-col rounded-[24px] p-5 transition hover:border-[color:var(--accent)] md:min-h-[260px]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-6 flex flex-1 flex-col">
                <h2 className="text-[1.75rem] font-semibold leading-[1.05] tracking-tight md:text-[1.95rem]">
                  {title}
                </h2>
                <p className="mt-4 max-w-[28ch] text-sm leading-8 text-[color:var(--muted)] md:text-[0.95rem]">
                  {body}
                </p>
              </div>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                Open
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
