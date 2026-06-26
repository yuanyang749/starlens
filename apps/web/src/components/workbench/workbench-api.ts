// Workbench 共享类型与 API 工具函数

import type { PaginatedResult, RepoSummary } from "@starlens-app/core";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type SyncResult = {
  status: "success" | "error";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pageCount: number;
  failedCount: number;
  errorSummary: string | null;
  errorLevel: "auth" | "rate_limit" | "network" | "unknown" | null;
  counts: {
    fetched: number;
    insertedOrUpdated: number;
    unstarred: number;
  };
  history: Array<{
    startedAt: string;
    status: "success" | "error";
    counts: { fetched: number; insertedOrUpdated: number; unstarred: number };
    errorSummary: string | null;
  }>;
};

export type AiAskResult = {
  answer: string;
  candidates: Array<{
    id: string;
    fullName: string;
    reason?: string;
    source?: string;
    score?: number;
  }>;
  providerConfigId: string | null;
  providerConfigSource?: "user_default" | "system_default" | "none";
};

export type AiSearchInsight = {
  id: string;
  fullName: string;
  reason: string;
  source: string | null;
  score?: number;
};

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (caught) {
    throw new Error(
      `网络请求失败：${
        caught instanceof Error ? caught.message : "请检查网络连接。"
      }`,
    );
  }

  let payload: ApiResponse<T>;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("响应解析失败：服务器返回了无效 JSON。");
  }

  if (!payload.ok) {
    throw new Error(`业务请求失败：${payload.error.message}`);
  }

  return payload.data;
}

export type { PaginatedResult, RepoSummary };
