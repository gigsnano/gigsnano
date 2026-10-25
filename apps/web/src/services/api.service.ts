import { createApiClient, HTTP_METHODS, type IApiClient, type THttpMethod } from "@gigsnano/core";

import { refreshSession } from "./auth/refresh";
import { shouldUseMock } from "./mock-fallback";

/**
 * Base HTTP client. Every service extends this; components never call it or
 * `fetch` directly (they go through a hook → service).
 *
 * Data source: the real backend is a separate Python/HTTP service. Until it's
 * wired, requests are transparently served by file-based mocks BELOW this
 * boundary — service/hook/component code is identical to production. Cutover is
 * a config change (`NEXT_PUBLIC_USE_MOCKS=false`), not a code change.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

/**
 * The verbs a service may send. `src/app/api/[...path]/route.ts` must export a
 * handler for every one of them: a Next route handler 405s any method it doesn't
 * name, so a verb listed here without a matching export there fails in prod only
 * — PUT was missing and digest preferences could never save (GIN-173). Exported
 * as a value, not just a type, so route.test.ts can pin the two together instead
 * of relying on someone remembering.
 */
export { HTTP_METHODS };
type Method = THttpMethod;

export abstract class APIService {
  protected readonly baseURL: string;
  private readonly client: IApiClient;

  constructor(baseURL: string = BASE_URL) {
    this.baseURL = baseURL;
    this.client = createApiClient({
      baseURL,
      // Read the global at call time so test stubs (vi.stubGlobal) take effect.
      fetch: (url, init) => fetch(url, init),
      credentials: "include",
      refresh: () => refreshSession(baseURL),
    });
  }

  protected async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    if (shouldUseMock(method, path)) {
      // Imported lazily so mock fixtures are never bundled into the real-API path.
      const { resolveMock } = await import("@/mocks");
      return resolveMock<T>(method, path, body);
    }
    return this.client.request<T>(method, path, body);
  }

  protected get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  protected post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
  /** POST a multipart/form-data body (file uploads) — bypasses JSON encoding. */
  protected postForm<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>("POST", path, form);
  }
  protected put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }
  protected patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }
  protected delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
