"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Star, FolderHeart, Award, History, Github } from "lucide-react";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";

interface RepoStats {
  total: number;
  byLanguage: Array<{ language: string; count: number }>;
  totalFavorites: number;
  mostStarredRepo: { fullName: string; stargazersCount: number } | null;
  monthlyTrend: Array<{ month: string; count: number }>;
  topRepos: Array<{ fullName: string; language: string | null; stargazersCount: number }>;
}

export function DashboardView() {
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => {
        if (!res.ok) throw new Error("获取统计数据失败");
        return res.json();
      })
      .then((res) => {
        if (res.ok) {
          setStats(res.data);
        } else {
          throw new Error(res.error?.message || "业务处理失败");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "请求统计数据出错");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-neutral-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-800" />
          <p className="text-sm font-medium">正在生成数据看板...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-red-500">
        <div className="text-center">
          <p className="font-semibold">加载看板出错</p>
          <p className="mt-1 text-sm opacity-80">{error || "数据为空"}</p>
        </div>
      </div>
    );
  }

  // 1) 转换语言数据格式以适应 RingChart
  // 环形图数据：按语言分类，最大数用 total 适配
  const ringData = stats.byLanguage.map((item, idx) => {
    // 为不同常用语言指定好看的颜色
    const colorMap: Record<string, string> = {
      TypeScript: "#3178c6",
      JavaScript: "#f1e05a",
      Python: "#3572A5",
      Go: "#00ADD8",
      Rust: "#dea584",
      HTML: "#e34c26",
      CSS: "#563d7c",
      Java: "#b07219",
      "C++": "#f34b7d",
    };
    const defaultColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    return {
      label: item.language,
      value: item.count,
      maxValue: stats.total,
      color: colorMap[item.language] || defaultColors[idx % defaultColors.length],
    };
  });

  // 2) 转换折线面积图数据格式
  // 将 "2026-05" 字符串转换为 Date，以供 TimeSeriesChart 能够正确按时间轴缩放
  const areaData = stats.monthlyTrend.map((item) => ({
    date: new Date(`${item.month}-01`),
    count: item.count,
  }));

  return (
    <div className="space-y-6">
        
        {/* 顶部标题 */}
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-neutral-800 dark:text-neutral-200" />
          <h1 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">Stars 看板</h1>
        </div>

        {/* 宏观指标卡片 (Metric Cards) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          
          <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">全部 Stars</p>
              <h3 className="mt-1 text-2xl font-bold text-neutral-800 dark:text-neutral-100">{stats.total}</h3>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Star className="h-6 w-6 fill-current" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">重点收藏</p>
              <h3 className="mt-1 text-2xl font-bold text-neutral-800 dark:text-neutral-100">{stats.totalFavorites}</h3>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <FolderHeart className="h-6 w-6" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
            <div className="truncate pr-4">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">最热门标星</p>
              <h3 className="mt-1 truncate text-lg font-bold text-neutral-800 dark:text-neutral-100" title={stats.mostStarredRepo?.fullName || "无"}>
                {stats.mostStarredRepo?.fullName.split("/")[1] || "无"}
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                ★ {stats.mostStarredRepo?.stargazersCount.toLocaleString() || 0}
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 p-3 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <Award className="h-6 w-6" />
            </div>
          </div>

        </div>

        {/* 可视化图表区 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          
          {/* 语言占比 - Bklit RingChart */}
          <div className="flex flex-col rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">标星语言分布</h4>
            
            <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-6 sm:flex-row">
              <div className="relative h-44 w-44">
                <RingChart data={ringData} size={176} strokeWidth={10} ringGap={4} baseInnerRadius={45}>
                  {ringData.map((_, idx) => (
                    <Ring key={idx} index={idx} showGlow={idx === 0} />
                  ))}
                  <RingCenter>
                    {({ value, label, isHovered }) => (
                      <div className="flex flex-col items-center text-center">
                        <span className="text-xs text-neutral-400 font-medium">
                          {isHovered ? label : "主要语言"}
                        </span>
                        <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                          {isHovered ? `${value} 个` : (stats.byLanguage[0]?.language || "无")}
                        </span>
                      </div>
                    )}
                  </RingCenter>
                </RingChart>
              </div>

              {/* 语言图例 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:flex sm:flex-col sm:gap-2">
                {ringData.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium text-neutral-600 dark:text-neutral-400 truncate max-w-[100px] sm:max-w-none">
                      {item.label}
                    </span>
                    <span className="text-neutral-400">({item.value})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 标星增长趋势 - Bklit AreaChart */}
          <div className="flex flex-col rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">标星增长趋势</h4>
            
            <div className="mt-6 flex-1 min-h-[176px]">
              {areaData.length > 1 ? (
                <AreaChart data={areaData} xDataKey="date" aspectRatio="2 / 1">
                  <Grid horizontal strokeDasharray="3 3" stroke="#f0f0f0" />
                  <Area dataKey="count" stroke="#3b82f6" fill="url(#blue-gradient)" strokeWidth={2} />
                  <XAxis />
                  <YAxis />
                  <ChartTooltip />
                  <defs>
                    <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-400 text-xs">
                  <History className="mr-1.5 h-4 w-4" />
                  暂无足够时间维度的历史增长数据
                </div>
              )}
            </div>
          </div>

        </div>

        {/* 顶部热门仓库列表 */}
        <div className="rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200">
            <Github className="h-4.5 w-4.5" />
            <h4 className="text-sm font-semibold">热门标星项目</h4>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-100 dark:border-neutral-900">
            <div className="grid grid-cols-12 bg-neutral-50 p-2.5 text-xs font-semibold text-neutral-500 dark:bg-neutral-900/50">
              <div className="col-span-8">仓库全称</div>
              <div className="col-span-2 text-right">主要语言</div>
              <div className="col-span-2 text-right">Stars 数</div>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {stats.topRepos && stats.topRepos.length > 0 ? (
                stats.topRepos.map((repo, idx) => (
                  <div key={idx} className="grid grid-cols-12 p-3 text-sm items-center hover:bg-neutral-50/50 dark:hover:bg-neutral-900/10 transition-colors">
                    <div className="col-span-8 font-medium text-neutral-800 dark:text-neutral-200 truncate pr-4">
                      {repo.fullName}
                    </div>
                    <div className="col-span-2 text-right text-xs text-neutral-500">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        {repo.language || "Unknown"}
                      </span>
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                      ★ {repo.stargazersCount.toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-neutral-400">
                  暂无标星数据，请点击右上角立即同步。
                </div>
              )}
            </div>
          </div>
        </div>

    </div>
  );
}
