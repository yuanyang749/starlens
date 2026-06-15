"use client";

import { Globe2, Info } from "lucide-react";
import webPackage from "../../package.json";

type GeneralSettingsViewProps = {
  appVersion?: string;
};

export function GeneralSettingsView({
  appVersion = webPackage.version,
}: GeneralSettingsViewProps) {
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
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
              {appVersion}
            </p>
          </div>
          <p className="text-sm leading-7 text-[color:var(--muted)]">
            这里保留运行时和发布信息，让系统级元数据与 Provider、Token 配置分开管理。
          </p>
        </div>
      </section>
    </div>
  );
}
