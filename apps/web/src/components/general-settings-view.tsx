"use client";

import { useEffect, useState } from "react";
import { Globe2, Info, RefreshCw } from "lucide-react";
import webPackage from "../../package.json";

type VersionInfo = {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  releaseUrl: string | null;
};

type GeneralSettingsViewProps = {
  appVersion?: string;
};

export function GeneralSettingsView({
  appVersion = webPackage.version,
}: GeneralSettingsViewProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({
    current: appVersion,
    latest: null,
    hasUpdate: false,
    releaseUrl: null,
  });
  const [checking, setChecking] = useState(true);

  // 中文注释：版本检查是非关键路径,失败时静默降级到"无新版本"状态即可,但仍记录日志便于排查。
  // 注意 /api/version 返回的不是 { ok, data } envelope,而是直接的 VersionInfo 对象,
  // 所以这里不能用 fetchApi(它会因为缺少 ok 字段抛错),用原生 fetch + AbortController。
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/version", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: VersionInfo) => {
        if (controller.signal.aborted) return;
        setVersionInfo(data);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // 静默降级,但留日志——否则版本检查失败无任何信号(原写法 .catch(() => {}) 完全静默)。
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.warn(`[general-settings] version check failed: ${msg}`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);

  function handleUpdate() {
    window.location.reload();
  }

  return (
    <div
      data-testid="general-settings-view"
      className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]"
    >
      <section className="app-panel rounded-[24px] p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
          <Globe2 className="h-4 w-4 text-[color:var(--accent)]" />
          界面语言
        </div>
        <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
          当前产品默认使用简体中文。技术名词会保留 GitHub、Provider、API Token 等原文，避免过度翻译影响理解。
        </p>
        <div className="mt-6 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4 md:max-w-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--muted)]">
            当前语言
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--foreground)]">
            简体中文
          </p>
        </div>
      </section>

      <section className="app-panel rounded-[24px] p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
          <Info className="h-4 w-4 text-[color:var(--accent)]" />
          构建信息
        </div>
        <div className="space-y-4">
          <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--muted)]">
              版本
            </p>
            <div className="mt-2 flex items-center gap-3">
              {/* 展示 versionInfo.current（来自 /api/version 实时读取的 package.json）而非 appVersion prop——
                  后者是构建进客户端 bundle 的静态值，浏览器缓存旧 chunk 时会跟服务端实际版本脱节。 */}
              <p className="text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
                {versionInfo.current}
              </p>
              {checking && (
                <span
                  data-testid="version-checking"
                  className="text-xs text-[color:var(--muted)]"
                >
                  检查中…
                </span>
              )}
              {!checking && !versionInfo.hasUpdate && versionInfo.latest && (
                <span
                  data-testid="version-up-to-date"
                  className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
                >
                  已是最新
                </span>
              )}
            </div>
            {!checking && versionInfo.hasUpdate && versionInfo.latest && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span
                  data-testid="version-update-badge"
                  className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                >
                  发现新版本 v{versionInfo.latest}
                </span>
                <button
                  data-testid="version-update-btn"
                  onClick={handleUpdate}
                  className="flex items-center gap-1.5 rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80"
                >
                  <RefreshCw className="h-3 w-3" />
                  立即更新
                </button>
                {versionInfo.releaseUrl && (
                  <a
                    href={versionInfo.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[color:var(--muted)] underline-offset-2 hover:underline"
                  >
                    查看更新说明
                  </a>
                )}
              </div>
            )}
          </div>
          <p className="text-sm leading-7 text-[color:var(--muted)]">
            这里保留运行时和发布信息，让系统级元数据与 Provider、Token 配置分开管理。
          </p>
        </div>
      </section>
    </div>
  );
}
