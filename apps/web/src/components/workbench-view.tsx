"use client";

import { useEffect, useState } from "react";
import { mockRepoDetails, type PaginatedResult, type RepoSummary } from "@starlens/core";
import {
  Bot,
  Clock3,
  Filter,
  FolderGit2,
  Search,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function WorkbenchView() {
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [repos, setRepos] = useState<RepoSummary[]>(mockRepoDetails);
  const [total, setTotal] = useState(mockRepoDetails.length);
  const [selectedId, setSelectedId] = useState<string>(mockRepoDetails[0].id);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      pageSize: "20",
      sort: query.trim() ? "relevance" : "updated",
    });

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (favoritesOnly) {
      params.set("favorite", "true");
    }

    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then(
        (payload: {
          ok: boolean;
          data?: PaginatedResult<RepoSummary>;
        }) => {
          const data = payload.data;

          if (payload.ok && data) {
            setRepos(data.items);
            setTotal(data.total);
            setSelectedId((current) =>
              data.items.some((repo) => repo.id === current)
                ? current
                : data.items[0]?.id ?? mockRepoDetails[0].id,
            );
          }
        },
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      });

    return () => controller.abort();
  }, [favoritesOnly, query]);

  const selectedRepo =
    repos.find((repo) => repo.id === selectedId) ??
    repos[0] ??
    mockRepoDetails[0];

  return (
    <div className="flex flex-col gap-5">
      <section className="app-panel rounded-[24px] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3 text-sm text-[color:var(--muted)]">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search repo names, tags, notes, and summaries"
                className="w-full bg-transparent text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted)]"
              />
            </label>
            <button
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                favoritesOnly
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--foreground)]"
                  : "border-[color:var(--line)] bg-[color:var(--panel-strong)] text-[color:var(--muted)]"
              }`}
            >
              <Star className="h-4 w-4" />
              Favorites
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm font-medium text-[color:var(--foreground)]"
            >
              <Filter className="h-4 w-4 text-[color:var(--accent)]" />
              Filters
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 text-sm font-medium text-[color:var(--foreground)]"
            >
              <Clock3 className="h-4 w-4 text-[color:var(--accent)]" />
              Sync now
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 text-sm font-medium text-white"
            >
              <Sparkles className="h-4 w-4" />
              AI search
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="app-panel overflow-hidden rounded-[24px]">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[color:var(--foreground)]">
                Starred repositories
              </p>
              <p className="text-sm text-[color:var(--muted)]">
                {total} matching repos from /api/search.
              </p>
            </div>
            <div className="rounded-full bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--muted)]">
              Updated May 5
            </div>
          </div>
          <div className="divide-y divide-[color:var(--line)]">
            {repos.map((repo) => {
              const selected = repo.id === selectedId;

              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => setSelectedId(repo.id)}
                  className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition ${
                    selected
                      ? "bg-[rgba(57,95,130,0.08)]"
                      : "bg-transparent hover:bg-[rgba(57,95,130,0.04)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <p className="truncate text-base font-semibold tracking-tight text-[color:var(--foreground)]">
                          {repo.fullName}
                        </p>
                        {repo.isFavorite ? (
                          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-2 text-xs font-medium text-[color:var(--accent)]">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            Favorite
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--muted)]">
                        {repo.repoSummary}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm text-[color:var(--muted)]">
                      <div>{formatCompactNumber(repo.stargazersCount)} stars</div>
                      <div>{formatDate(repo.pushedAtGithub)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-2)] px-2.5 py-1">
                      <FolderGit2 className="h-3.5 w-3.5" />
                      {repo.language}
                    </span>
                    {repo.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--line)] px-2.5 py-1"
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
            {repos.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[color:var(--muted)]">
                No matching repositories in the mock API result set.
              </div>
            ) : null}
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[color:var(--muted)]">
                Selected repository
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
                {selectedRepo.fullName}
              </h2>
            </div>
            <a
              href={selectedRepo.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-full border border-[color:var(--line)] px-4 text-sm font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--accent)]"
            >
              Open on GitHub
            </a>
          </div>

          <div className="mt-6 grid gap-4 2xl:grid-cols-3">
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4 2xl:col-span-1">
              <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Summary
              </p>
              <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]">
                {selectedRepo.repoSummary}
              </p>
            </div>
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Stats
              </p>
              <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]">
                {formatCompactNumber(selectedRepo.stargazersCount)} stars,{" "}
                {formatCompactNumber(selectedRepo.forksCount)} forks,{" "}
                {selectedRepo.openIssuesCount} open issues.
              </p>
            </div>
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Source context
              </p>
              <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]">
                {selectedRepo.visibility}, {selectedRepo.licenseName},{" "}
                branch {selectedRepo.defaultBranch}.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[22px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-[color:var(--foreground)]">
                  Personal note
                </p>
                <span className="text-xs text-[color:var(--muted)]">
                  Static for milestone one
                </span>
              </div>
              <textarea
                readOnly
                value={selectedRepo.note}
                className="min-h-36 w-full resize-none rounded-[18px] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3 text-sm leading-7 text-[color:var(--foreground)] outline-none"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedRepo.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--accent)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Bot className="h-4 w-4 text-[color:var(--accent)]" />
                AI summary
              </div>
              <p className="text-sm leading-7 text-[color:var(--muted)]">
                {selectedRepo.aiSummary ?? selectedRepo.readmeExcerpt}
              </p>
              <div className="mt-5 rounded-[18px] border border-dashed border-[color:var(--line)] bg-[rgba(57,95,130,0.06)] p-4 text-sm text-[color:var(--muted)]">
                Next milestone: wire this panel to `/api/ai/summarize` and
                `/api/ai/rerank`, keeping the database search layer in charge of
                recall.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
