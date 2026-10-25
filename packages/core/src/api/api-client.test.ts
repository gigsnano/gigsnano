import { describe, expect, it, vi } from "vitest";

import { APIError } from "./api-error";
import { createApiClient } from "./api-client";

function res(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("createApiClient", () => {
  it("sends JSON with injected headers and returns the parsed body", async () => {
    const fetch = vi.fn(async () => res(200, { ok: true }));
    const client = createApiClient({
      baseURL: "http://api",
      fetch,
      getHeaders: () => ({ Authorization: "Bearer t" }),
    });

    await expect(client.request("POST", "/x/", { a: 1 })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("http://api/x/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({ a: 1 }),
      credentials: undefined,
    });
  });

  it("leaves Content-Type to the platform for FormData", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => res(200, {}));
    const form = new FormData();
    await createApiClient({ baseURL: "http://api", fetch }).request("POST", "/up/", form);
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({});
    expect(init.body).toBe(form);
  });

  it("returns undefined for 204", async () => {
    const client = createApiClient({ baseURL: "http://api", fetch: async () => res(204) });
    await expect(client.request("DELETE", "/x/")).resolves.toBeUndefined();
  });

  it("single-flights refresh across concurrent 401s and replays each request once", async () => {
    let authed = false;
    const refresh = vi.fn(async () => {
      authed = true;
      return true;
    });
    const fetch = vi.fn(async () => (authed ? res(200, { ok: true }) : res(401, {})));
    const client = createApiClient({ baseURL: "http://api", fetch, refresh });

    const out = await Promise.all([
      client.request("GET", "/a/"),
      client.request("GET", "/b/"),
      client.request("GET", "/c/"),
    ]);

    expect(out).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("never refreshes on auth entry paths, web or mobile", async () => {
    const refresh = vi.fn(async () => true);
    const client = createApiClient({ baseURL: "http://api", fetch: async () => res(401, {}), refresh });
    await expect(client.request("POST", "/auth/sign-in/", {})).rejects.toMatchObject({ status: 401 });
    await expect(client.request("POST", "/auth/mobile/refresh/", {})).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces the original 401 when refresh fails or throws", async () => {
    const client = createApiClient({
      baseURL: "http://api",
      fetch: async () => res(401, { detail: "expired" }),
      refresh: async () => {
        throw new Error("boom");
      },
    });
    await expect(client.request("GET", "/a/")).rejects.toMatchObject({ status: 401, message: "expired" });
  });

  it("uses a structured detail message and code", async () => {
    const client = createApiClient({
      baseURL: "http://api",
      fetch: async () => res(404, { detail: { code: "no_account", message: "No account." } }),
    });
    const error = await client.request("POST", "/auth/mobile/google/", {}).catch((e) => e);
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ status: 404, message: "No account.", code: "no_account" });
  });

  it("falls back to a generic message for 422 arrays", async () => {
    const client = createApiClient({
      baseURL: "http://api",
      fetch: async () => res(422, { detail: [{ msg: "bad" }] }),
    });
    await expect(client.request("POST", "/x/", {})).rejects.toMatchObject({
      message: "POST /x/ failed with 422",
      code: undefined,
    });
  });

  it("wraps network failures as status 0 with code network", async () => {
    const client = createApiClient({
      baseURL: "http://api",
      fetch: async () => {
        throw new TypeError("Network request failed");
      },
    });
    await expect(client.request("GET", "/a/")).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
