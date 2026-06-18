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

  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then((data: VersionInfo) => setVersionInfo(data))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  function handleUpdate() {
    if (versionInfo.releaseUrl) {
      window.open(versionInfo.releaseUrl, "_blank", "noopener,noreferrer");
    } else {
      window.location.reload();
    }
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
              <p className="text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
                {appVersion}
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
              <div className="mt-3 flex items-center gap-3">
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
