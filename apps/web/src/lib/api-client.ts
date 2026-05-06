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

export async function fetchApi<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!payload || payload.ok !== true || payload.data === undefined) {
    const message = payload?.error?.message ?? `Request failed with status ${response.status}`;
    const code = payload?.error?.code ?? "invalid_api_response";
    throw new ApiClientError(message, code, response.status);
  }

  return payload.data;
}
