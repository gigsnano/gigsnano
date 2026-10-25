import { APIError } from "./api-error";
import { isAuthEntryPath } from "./auth-paths";

/**
 * Every verb a service may send. The web proxy route must export a handler for each
 * (`src/app/api/[...path]/route.ts`; pinned by its route.test.ts).
 */
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type THttpMethod = (typeof HTTP_METHODS)[number];

export interface IApiClientOptions {
  baseURL: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Per-request headers, e.g. the mobile app's bearer token. */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** "include" on web (cookie session); omitted on mobile. */
  credentials?: RequestCredentials;
  /** Mint a new session after a 401. Resolve true when requests should be replayed. */
  refresh?: () => Promise<boolean>;
}

export interface IApiClient {
  request<T>(method: THttpMethod, path: string, body?: unknown): Promise<T>;
}

function errorFrom(method: string, path: string, status: number, data: unknown): APIError {
  // Surface the server's human-readable reason; FastAPI sends a string, our
  // structured errors send {code, message}, and 422s send an array.
  const detail = (data as { detail?: unknown } | undefined)?.detail;
  const structured =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as { code?: unknown; message?: unknown })
      : undefined;
  const message =
    typeof detail === "string" && detail
      ? detail
      : typeof structured?.message === "string"
        ? structured.message
        : `${method} ${path} failed with ${status}`;
  const code = typeof structured?.code === "string" ? structured.code : undefined;
  return new APIError(status, message, data, code);
}

export function createApiClient(options: IApiClientOptions): IApiClient {
  let refreshing: Promise<boolean> | null = null;

  // A burst of 401s shares one refresh call.
  function refreshOnce(): Promise<boolean> {
    refreshing ??= (options.refresh ?? (async () => false))()
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function send(method: THttpMethod, path: string, body: unknown): Promise<Response> {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(await options.getHeaders?.()),
    };
    try {
      return await options.fetch(`${options.baseURL}${path}`, {
        method,
        headers,
        body: isForm ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
        credentials: options.credentials,
      });
    } catch (cause) {
      throw new APIError(0, "Can't reach GigsNano. Check your connection.", cause, "network");
    }
  }

  async function request<T>(
    method: THttpMethod,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    const res = await send(method, path, body);
    if (!res.ok) {
      if (res.status === 401 && !retried && options.refresh && !isAuthEntryPath(path)) {
        if (await refreshOnce()) return request<T>(method, path, body, true);
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = undefined;
      }
      throw errorFrom(method, path, res.status, data);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return { request: (method, path, body) => request(method, path, body) };
}
