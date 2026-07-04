export type ApiErrorPayload = {
  code: string;
  message: string;
};

export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiErrorPayload;
};

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "unknown_error", status = 500) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

// 中文注释:统一 fetch 封装,处理三类异常:
// 1) 网络层错误(fetch 抛 TypeError)→ 转成 ApiClientError(network_error, status=0),给出友好中文提示
// 2) 401 未授权 → 跳登录页,避免用户陷入"看到英文错误但不知道重新登录"的死循环
// 3) 业务错误(payload.ok=false) → 抛 ApiClientError 带 code/status,调用方可 instanceof 判断
// 不做重试和超时——调用方可用 AbortSignal.timeout() 自行控制,保持封装最小化。
export async function fetchApi<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (caught) {
    // 网络断开 / DNS 失败 / CORS 拦截 / 超时(若调用方用了 AbortSignal.timeout 则走 AbortError 分支)
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }
    const msg = caught instanceof Error ? caught.message : "请检查网络连接。";
    throw new ApiClientError(`网络请求失败：${msg}`, "network_error", 0);
  }

  // 401:session 失效或 Personal Token 无效。跳登录页让用户重新认证,避免错误信息陷入死循环。
  // 用 window.location 跳转而非 router.push,确保彻底清掉客户端状态。
  if (response.status === 401 && typeof window !== "undefined") {
    // 仅对同源 API 请求跳登录,避免误伤跨域请求(如 GitHub release API)。
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("/")) {
      window.location.href = `/?error=SessionExpired`;
      // 抛错阻止后续 .then 执行,但 throw 之前已开始跳转
      throw new ApiClientError("登录已失效,正在跳转登录页。", "unauthorized", 401);
    }
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!payload || payload.ok !== true || payload.data === undefined) {
    const message = payload?.error?.message ?? `Request failed with status ${response.status}`;
    const code = payload?.error?.code ?? "invalid_api_response";
    throw new ApiClientError(message, code, response.status);
  }

  return payload.data;
}
