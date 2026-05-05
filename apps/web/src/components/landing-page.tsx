import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Github,
  LayoutPanelLeft,
  Play,
  Search,
  Server,
  Sparkles,
  TerminalSquare,
  Tags,
  Workflow,
} from "lucide-react";

const featureGroups = [
  {
    title: "Search and filter with context",
    body: "Jump back into old stars through repo names, owner, language, tags, notes, and a cleaner summary layer.",
    icon: Search,
  },
  {
    title: "Turn stars into working memory",
    body: "Add notes, tags, and favorites so your saved repos become a usable personal knowledge base instead of a graveyard.",
    icon: Tags,
  },
  {
    title: "Use AI without lock-in",
    body: "Ask natural questions, rerank candidates, and summarize repos while keeping provider choice in your own hands.",
    icon: Bot,
  },
];

const providers = [
  "Vercel AI Gateway",
  "OpenAI-compatible endpoints",
  "Anthropic native",
  "Gemini native",
];

const workflowNotes = [
  "Web workbench for scanning, comparing, and annotating repos.",
  "CLI surface for quick search and sync from the terminal.",
  "Agent-ready tokens so Hermes or OpenClaw can reuse the same capability set.",
];

export function LandingPage() {
  return (
    <div className="grain min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[rgba(245,247,248,0.8)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] text-[color:var(--accent)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-base tracking-tight">Starlens</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[color:var(--muted)] md:flex">
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <a href="#providers">Providers</a>
            <a href="#oss">Open source</a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/yuanyang749/starlens"
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center gap-2 rounded-full border border-[color:var(--line)] px-4 text-sm font-medium text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)] sm:flex"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <Link
              href="/app"
              className="flex h-10 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white transition hover:bg-[color:var(--accent)]"
            >
              Enter workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-10 lg:py-18">
          <div className="flex flex-col justify-center gap-8">
            <div className="flex max-w-xl flex-col gap-6">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Starlens
              </p>
              <h1 className="max-w-2xl text-5xl leading-[1.02] font-semibold tracking-tight text-[color:var(--foreground)] sm:text-6xl">
                A calmer way to find the GitHub repos you already loved.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[color:var(--muted)]">
                Search old stars, add personal context, and turn scattered
                bookmarks into a workbench that actually helps you remember why
                something mattered.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/app"
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--foreground)] px-6 text-sm font-medium text-white transition hover:bg-[color:var(--accent)]"
              >
                Use GitHub login
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/yuanyang749/starlens"
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--line)] px-6 text-sm font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--accent)] hover:bg-white"
              >
                <Github className="h-4 w-4" />
                View repository
              </a>
            </div>

            <div className="grid gap-4 text-sm text-[color:var(--muted)] sm:grid-cols-3">
              <div className="app-panel rounded-2xl p-4">
                <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground)]">
                  <Search className="h-4 w-4 text-[color:var(--accent)]" />
                  Search
                </div>
                Repo names, owners, notes, tags, and summary context in one place.
              </div>
              <div className="app-panel rounded-2xl p-4">
                <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground)]">
                  <Bot className="h-4 w-4 text-[color:var(--accent)]" />
                  AI
                </div>
                Ask what a repo does, rerank candidates, or summarize quickly.
              </div>
              <div className="app-panel rounded-2xl p-4">
                <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground)]">
                  <Workflow className="h-4 w-4 text-[color:var(--accent)]" />
                  Reuse
                </div>
                One data model shared across web, CLI, and agent flows.
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[34rem] items-end justify-end overflow-hidden rounded-[28px] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(236,242,245,0.92))] px-3 pt-10 shadow-[0_32px_80px_rgba(15,23,32,0.10)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(57,95,130,0.18),transparent_32%)]" />
            <div className="absolute inset-x-3 top-4 flex items-center justify-between rounded-full border border-[color:var(--line)] bg-[rgba(255,255,255,0.78)] px-4 py-2 text-xs text-[color:var(--muted)] backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#9aa9b7]" />
                Live workbench preview
              </div>
              <div className="flex items-center gap-2">
                <Play className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                Motion proof
              </div>
            </div>
            <div className="relative z-10 ml-auto flex w-full max-w-4xl flex-col gap-4">
              <div className="overflow-hidden rounded-[22px] border border-[rgba(15,23,32,0.18)] bg-[rgba(255,255,255,0.92)] shadow-[0_24px_60px_rgba(15,23,32,0.14)]">
                <div className="relative aspect-[21/10] w-full overflow-hidden bg-[#eef3f6]">
                  <Image
                    src="/design/starlens-workbench-concept-21x9.png"
                    alt="Starlens workbench preview"
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover object-left-top"
                    priority
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="app-panel rounded-[20px] p-4">
                  <div className="mb-4 flex items-center justify-between text-sm">
                    <span className="font-medium text-[color:var(--foreground)]">
                      Search to organization loop
                    </span>
                    <span className="text-[color:var(--muted)]">11s silent clip</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {["Search", "Compare", "Annotate"].map((step, index) => (
                      <div
                        key={step}
                        className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3"
                      >
                        <div className="mb-3 flex items-center justify-between text-xs text-[color:var(--muted)]">
                          <span>{step}</span>
                          <span>0{index + 1}</span>
                        </div>
                        <div className="h-20 rounded-xl bg-[linear-gradient(180deg,#eef3f6,#dfe8ee)]" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 h-1.5 rounded-full bg-[rgba(15,23,32,0.06)]">
                    <div className="h-1.5 w-3/5 rounded-full bg-[color:var(--accent)]" />
                  </div>
                </div>
                <div className="app-panel rounded-[20px] p-4 text-sm text-[color:var(--muted)]">
                  <div className="mb-3 flex items-center gap-2 text-[color:var(--foreground)]">
                    <LayoutPanelLeft className="h-4 w-4 text-[color:var(--accent)]" />
                    Public proof, not marketing theater
                  </div>
                  <p className="leading-7">
                    Show the real product, let motion confirm the workflow, and
                    keep the page readable even when media is disabled.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="border-y border-[color:var(--line)] bg-[rgba(255,255,255,0.54)]"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-16 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Core capabilities
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                Fewer guesses, more memory.
              </h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {featureGroups.map(({ title, body, icon: Icon }) => (
                <article
                  key={title}
                  className="app-panel flex min-h-64 flex-col justify-between rounded-[22px] p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-10">
                    <h3 className="text-xl font-semibold tracking-tight text-[color:var(--foreground)]">
                      {title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
                      {body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Workflow
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                One capability set, three ways to reach it.
              </h2>
              <div className="mt-8 flex flex-col gap-4 text-sm leading-7 text-[color:var(--muted)]">
                {workflowNotes.map((item) => (
                  <div
                    key={item}
                    className="app-panel flex items-start gap-3 rounded-[18px] p-4"
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <article className="app-panel rounded-[24px] p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                  <TerminalSquare className="h-4 w-4 text-[color:var(--accent)]" />
                  CLI quick path
                </div>
                <div className="rounded-[20px] border border-[color:var(--line)] bg-[#101820] p-4 font-mono text-sm leading-7 text-[#d8e4ef]">
                  <div>$ stars search &quot;react virtualization&quot;</div>
                  <div className="text-[#8fa9c0]">bvaughn/react-window</div>
                  <div className="text-[#8fa9c0]">tanstack/virtual</div>
                  <div>$ stars ask &quot;which one is the lightest?&quot;</div>
                </div>
              </article>
              <article className="app-panel rounded-[24px] p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                  <Workflow className="h-4 w-4 text-[color:var(--accent)]" />
                  Agent handoff
                </div>
                <div className="flex flex-col gap-3 text-sm text-[color:var(--muted)]">
                  {["Create token", "Attach to agent", "Search and annotate", "Return grounded repo picks"].map((step) => (
                    <div
                      key={step}
                      className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3"
                    >
                      {step}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="providers" className="border-y border-[color:var(--line)] bg-[rgba(255,255,255,0.54)]">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Provider support
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                Keep the AI layer flexible without turning the product into an AI dashboard.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[color:var(--muted)]">
                Starlens uses AI to explain, rerank, and summarize repo candidates.
                The search backbone still belongs to your data model, not a chat box.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {providers.map((provider) => (
                <div
                  key={provider}
                  className="app-panel flex min-h-36 flex-col justify-between rounded-[20px] p-5"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                    <Server className="h-4 w-4 text-[color:var(--accent)]" />
                    {provider}
                  </div>
                  <p className="text-sm leading-7 text-[color:var(--muted)]">
                    Configuration stays user-owned, with validation, model selection, and a calm settings surface.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="oss" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Open source and self-hosting
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                Private enough for your own workflow, open enough to grow in public.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="app-panel rounded-[20px] p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                  <Server className="h-4 w-4 text-[color:var(--accent)]" />
                  PostgreSQL first
                </div>
                <p className="text-sm leading-7 text-[color:var(--muted)]">
                  Search documents, notes, tags, sync metadata, and provider configs live on a sane relational model.
                </p>
              </div>
              <div className="app-panel rounded-[20px] p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                  <Github className="h-4 w-4 text-[color:var(--accent)]" />
                  Private by default
                </div>
                <p className="text-sm leading-7 text-[color:var(--muted)]">
                  Start from a personal repo and evolve toward a cleaner open-source story without redoing the structure.
                </p>
              </div>
              <div className="app-panel rounded-[20px] p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                  <Workflow className="h-4 w-4 text-[color:var(--accent)]" />
                  Vercel-ready
                </div>
                <p className="text-sm leading-7 text-[color:var(--muted)]">
                  The initial milestone is built to run fast on a hosted preview while we keep the later data layer open.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--line)] bg-[rgba(255,255,255,0.72)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-[color:var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p>Starlens is a workbench for repos you meant to remember.</p>
          <div className="flex items-center gap-4">
            <a href="https://github.com/yuanyang749/starlens" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/app">Workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
