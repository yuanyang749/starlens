"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowUpRight,
  CalendarPlus,
  Database,
  FolderHeart,
  Github,
  History,
  Sparkles,
  Star,
  Tags,
  TriangleAlert,
} from "lucide-react";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { fetchApi } from "@/lib/api-client";

interface RepoStats {
  total: number;
  byLanguage: Array<{ language: string; count: number }>;
  totalFavorites: number;
  recentAdded: number;
  attention: {
    total: number;
    stale: number;
    archived: number;
    disabled: number;
    untagged: number;
    missingMetadata: number;
  };
  attentionRepos: Array<{
    id: string;
    fullName: string;
    language: string | null;
    stargazersCount: number;
    pushedAtGithub: string | null;
    reasons: string[];
  }>;
  lastSyncedAt: string | null;
  mostStarredRepo: { fullName: string; stargazersCount: number } | null;
  monthlyTrend: Array<{ month: string; count: number }>;
  topStarredRepos: Array<{ fullName: string; language: string | null; stargazersCount: number }>;
}

type DashboardViewProps = {
  onNavigateToRepo?: (repoId: string, fullName: string) => void;
};

type AttentionFilter = "all" | "stale" | "archived" | "disabled" | "untagged" | "missingMetadata";

const ATTENTION_FILTERS: Array<{ id: AttentionFilter; label: string; countKey: keyof RepoStats["attention"] | null }> = [
  { id: "all", label: "全部", countKey: "total" },
  { id: "stale", label: "过时", countKey: "stale" },
  { id: "archived", label: "归档", countKey: "archived" },
  { id: "disabled", label: "停用", countKey: "disabled" },
  { id: "untagged", label: "未分类", countKey: "untagged" },
  { id: "missingMetadata", label: "数据缺失", countKey: "missingMetadata" },
];

const LANGUAGE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#f59e0b", "#8b5cf6", "#94a3b8"];

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  iconClassName,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: ReactNode;
  iconClassName: string;
}) {
  return (
    <article className="group rounded-2xl border border-[color:var(--line)] bg-white/85 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-neutral-950/45">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-neutral-500">{label}</p>
          <div className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">{value}</div>
          <p className="mt-1 truncate text-xs text-neutral-400" title={hint}>{hint}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
          {icon}
        </span>
      </div>
    </article>
  );
}

function reasonClass(reason: string) {
  if (reason === "已归档" || reason === "已停用") {
    return "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  }
  if (reason === "长期未更新") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

export function DashboardView({ onNavigateToRepo }: DashboardViewProps = {}) {
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");

  // 中文注释：统一通过 fetchApi 获取统计数据，并在切换工作台页签时取消旧请求，避免竞态更新。
  useEffect(() => {
    const controller = new AbortController();
    const params = attentionFilter === "all" ? "" : `?attention=${attentionFilter}`;
    fetchApi<RepoStats>(`/api/stats${params}`, { signal: controller.signal })
      .then((data) => {
        setStats(data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "请求统计数据出错";
        setError(message);
        console.warn(`[dashboard] load stats failed: ${message}`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attentionFilter]);

  const languageRows = useMemo(() => {
    if (!stats) return [];
    const primary = stats.byLanguage.slice(0, 5);
    const covered = primary.reduce((sum, item) => sum + item.count, 0);
    const otherCount = Math.max(0, stats.total - covered);
    return otherCount > 0 ? [...primary, { language: "其他", count: otherCount }] : primary;
  }, [stats]);

  if (loading) {
    return (
      <div className="grid h-full grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="正在生成数据看板">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className={`animate-pulse rounded-2xl bg-[color:var(--surface-2)] ${index > 3 ? "h-72 lg:col-span-2" : "h-28"}`} />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-rose-600">
        <div className="max-w-sm rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900 dark:bg-rose-950/30">
          <TriangleAlert className="mx-auto h-6 w-6" />
          <p className="mt-2 font-semibold">加载看板出错</p>
          <p className="mt-1 text-sm opacity-80">{error || "数据为空"}</p>
        </div>
      </div>
    );
  }

  const favoriteRate = stats.total > 0 ? (stats.totalFavorites / stats.total) * 100 : 0;
  const maxLanguageCount = Math.max(...languageRows.map((item) => item.count), 1);
  const areaData = stats.monthlyTrend.map((item) => ({
    date: new Date(`${item.month}-01T00:00:00.000Z`),
    count: item.count,
  }));
  const trendTotal = stats.monthlyTrend.reduce((sum, item) => sum + item.count, 0);
  const trendRange = stats.monthlyTrend.length > 0
    ? `${stats.monthlyTrend[0]?.month.replace("-", "年")}月 — ${stats.monthlyTrend.at(-1)?.month.replace("-", "年")}月`
    : "暂无时间范围";
  const activeAttentionFilter = ATTENTION_FILTERS.find((item) => item.id === attentionFilter) ?? ATTENTION_FILTERS[0];

  return (
    <div className="h-full overflow-auto">
      <section className="app-panel min-h-full rounded-[24px] p-4 sm:p-5">
        <div className="space-y-5">
          <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                  <Sparkles className="h-4 w-4" />
                </span>
                <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">收藏洞察</h2>
              </div>
              <p className="mt-1.5 text-sm text-neutral-500">看清收藏变化，优先处理真正值得关注的仓库。</p>
            </div>
            <p className="text-xs text-neutral-400">
              数据同步于 <time dateTime={stats.lastSyncedAt ?? undefined}>{formatDate(stats.lastSyncedAt, true)}</time>
            </p>
          </header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="全部收藏"
              value={stats.total.toLocaleString()}
              hint="当前仍在 GitHub 标星的仓库"
              icon={<Star className="h-5 w-5 fill-current" />}
              iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
            />
            <MetricCard
              label="重点收藏率"
              value={`${favoriteRate.toFixed(1)}%`}
              hint={`${stats.totalFavorites} / ${stats.total} 个重点收藏`}
              icon={<FolderHeart className="h-5 w-5" />}
              iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
            />
            <MetricCard
              label="近 30 天新增"
              value={stats.recentAdded.toLocaleString()}
              hint={`近 12 个月共新增 ${trendTotal} 个`}
              icon={<CalendarPlus className="h-5 w-5" />}
              iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
            />
            <MetricCard
              label="待关注仓库"
              value={stats.attention.total.toLocaleString()}
              hint="归档、过时、未分类或数据不完整"
              icon={<TriangleAlert className="h-5 w-5" />}
              iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <article className="rounded-2xl border border-[color:var(--line)] bg-white/85 p-5 shadow-sm dark:bg-neutral-950/45 xl:col-span-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">主要语言分布</h3>
                  <p className="mt-1 text-xs text-neutral-400">按仓库数量比较，其他语言合并展示</p>
                </div>
                <Database className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="mt-5 space-y-3.5">
                {languageRows.map((item, index) => {
                  const percentage = stats.total > 0 ? (item.count / stats.total) * 100 : 0;
                  return (
                    <div key={item.language}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-neutral-700 dark:text-neutral-300">
                          {item.language === "Unknown" ? "未识别" : item.language}
                        </span>
                        <span className="shrink-0 font-mono text-neutral-500">
                          {item.count} · {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${(item.count / maxLanguageCount) * 100}%`,
                            backgroundColor: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-[color:var(--line)] bg-white/85 p-5 shadow-sm dark:bg-neutral-950/45 xl:col-span-7">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">每月新增 Stars</h3>
                  <p className="mt-1 text-xs text-neutral-400">最近 12 个月，空缺月份按 0 计</p>
                </div>
                <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 font-mono text-[11px] text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  {trendRange}
                </span>
              </div>
              <div className="mt-3 h-[230px]">
                {areaData.length > 1 ? (
                  <AreaChart data={areaData} xDataKey="date" aspectRatio="auto" className="h-full">
                    <Grid horizontal strokeDasharray="3 3" stroke="var(--line)" />
                    <Area dataKey="count" stroke="#2563eb" fill="url(#dashboard-blue-gradient)" strokeWidth={2.25} />
                    <XAxis numTicks={4} />
                    <YAxis />
                    <ChartTooltip />
                    <defs>
                      <linearGradient id="dashboard-blue-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                    <History className="mr-1.5 h-4 w-4" />暂无足够的时间数据
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
            <article
              data-testid="dashboard-attention-card"
              className="flex h-[500px] min-h-0 flex-col rounded-2xl border border-[color:var(--line)] bg-white/85 p-5 shadow-sm dark:bg-neutral-950/45 xl:col-span-8"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    <TriangleAlert className="h-4 w-4 text-amber-500" />需要关注
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">按原因筛选后，点击仓库进入详情进行标记、补充标签或判断是否继续保留。</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]" aria-label="待关注仓库筛选">
                  {ATTENTION_FILTERS.map((filter) => {
                    const count = filter.countKey ? stats.attention[filter.countKey] : 0;
                    const active = filter.id === attentionFilter;
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setAttentionFilter(filter.id)}
                        aria-pressed={active}
                        className={active
                          ? "rounded-full bg-blue-600 px-2 py-1 text-white shadow-sm"
                          : "rounded-full bg-slate-100 px-2 py-1 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"}
                      >
                        {filter.label} {count}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-[color:var(--line)]">
                {stats.attentionRepos.length > 0 ? (
                  <div className="divide-y divide-[color:var(--line)]">
                    {stats.attentionRepos.map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => onNavigateToRepo?.(repo.id, repo.fullName)}
                        disabled={!onNavigateToRepo}
                        className="flex w-full items-center justify-between gap-4 bg-transparent px-3.5 py-3 text-left transition-colors duration-200 hover:bg-blue-50/60 disabled:cursor-default dark:hover:bg-blue-950/20"
                        aria-label={`查看 ${repo.fullName}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">{repo.fullName}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {repo.reasons.map((reason) => (
                              <span key={reason} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${reasonClass(reason)}`}>
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-right">
                          <div className="hidden sm:block">
                            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{repo.language || "未识别"}</p>
                            <p className="mt-0.5 text-[10px] text-neutral-400">最后推送 {formatDate(repo.pushedAtGithub)}</p>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-neutral-400">{activeAttentionFilter.label}分类下暂时没有待关注仓库。</div>
                )}
              </div>
            </article>

            <aside
              data-testid="dashboard-community-card"
              className="flex h-[500px] min-h-0 flex-col rounded-2xl border border-[color:var(--line)] bg-white/85 p-5 shadow-sm dark:bg-neutral-950/45 xl:col-span-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    <Github className="h-4 w-4" />收藏中高 Star 项目
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">按你已收藏项目的 GitHub Star 数排序</p>
                </div>
                <Archive className="h-4 w-4 text-neutral-300" />
              </div>
              <div
                data-testid="dashboard-community-scroll"
                className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1"
              >
                {stats.topStarredRepos.map((repo, index) => (
                  <a
                    key={repo.fullName}
                    href={`https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-200 hover:bg-[color:var(--surface-2)]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">{repo.fullName}</p>
                      <p className="mt-0.5 truncate text-[10px] text-neutral-400">{repo.language || "未识别"}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-neutral-500">
                      ★ {repo.stargazersCount.toLocaleString()}
                    </span>
                  </a>
                ))}
              </div>
              <div className="mt-3 flex shrink-0 items-center gap-2 rounded-xl bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-neutral-500">
                <Tags className="h-3.5 w-3.5" />GitHub Star 仅是热度信号，不代表你的使用优先级。
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
