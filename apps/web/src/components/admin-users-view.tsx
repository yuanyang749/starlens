"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RefreshCw, Shield, Star, Zap } from "lucide-react";
import { fetchApi } from "@/lib/api-client";
import { formatDateTime } from "./workbench/workbench-formatters";

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  starredCount: number;
  totalTokens: number;
};

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AdminUsersView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 中文注释:用 AbortController 防止 Strict Mode 双挂载或切 tab 重 mount 时的竞态。
  // 原写法 useEffect 内直接 void load() 无 controller,旧请求可能覆盖新请求。
  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<AdminUser[]>("/api/admin/users", { signal });
      setUsers(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "加载失败。");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  return (
    <section className="app-panel rounded-[24px] p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
          <Shield className="h-4 w-4 text-[color:var(--accent)]" />
          用户管理
          {!loading && (
            <span className="rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 text-xs text-[color:var(--muted)]">
              {users.length} 人
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)] disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          刷新
        </button>
      </div>

      {error ? (
        <p className="rounded-[14px] border border-red-200 bg-red-50 p-3 text-sm text-red-500">{error}</p>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-[16px] bg-[color:var(--surface-2)]" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">暂无注册用户。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--line)] text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                <th className="pb-3 pr-4">用户</th>
                <th className="pb-3 pr-4">注册时间</th>
                <th className="pb-3 pr-4">最后登录</th>
                <th className="pb-3 pr-4">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" />Stars
                  </span>
                </th>
                <th className="pb-3">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />Token 用量
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {users.map((user) => (
                <tr key={user.id} className="group">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      {user.avatarUrl ? (
                        <Image
                          src={user.avatarUrl}
                          alt={user.name ?? ""}
                          width={28}
                          height={28}
                          className="rounded-full"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--surface-2)] text-xs font-bold text-[color:var(--muted)]">
                          {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[color:var(--foreground)]">
                          {user.name ?? "—"}
                        </p>
                        <p className="truncate text-xs text-[color:var(--muted)]">{user.email ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-[color:var(--muted)]">
                    {formatDateTime(user.createdAt)}
                  </td>
                  <td className="py-3 pr-4 text-[color:var(--muted)]">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-medium text-[color:var(--foreground)]">
                      {user.starredCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3">
                    {user.totalTokens > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">
                        <Zap className="h-3 w-3" />
                        {formatTokens(user.totalTokens)}
                      </span>
                    ) : (
                      <span className="text-xs text-[color:var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
