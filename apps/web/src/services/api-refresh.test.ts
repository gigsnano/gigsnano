import { afterEach, describe, expect, it, vi } from "vitest";

import { APIService } from "./api.service";

// Concrete probe: exposes the protected verbs so we can drive request() directly.
class ProbeService extends APIService {
  constructor() {
    super("http://api");
  }
  projects() {
    return this.get<{ ok: boolean }>("/workspaces/acme/projects/");
  }
  signIn() {
    return this.post("/auth/sign-in/", {});
  }
}

function res(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("APIService — 401 silent refresh-and-retry", () => {
  it("refreshes then replays the original request after a 401", async () => {
    const calls: string[] = [];
    let projects = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/auth/refresh/")) return res(200, {});
        if (url.endsWith("/workspaces/acme/projects/")) {
          projects++;
          return projects === 1 ? res(401, { detail: "expired" }) : res(200, { ok: true });
        }
        return res(200, {});
      }),
    );

    const out = await new ProbeService().projects();

    expect(out).toEqual({ ok: true });
    expect(calls).toEqual([
      "GET http://api/workspaces/acme/projects/",
      "POST http://api/auth/refresh/",
      "GET http://api/workspaces/acme/projects/",
    ]);
  });

  it("retries at most once — a still-401 after refresh throws, no infinite loop", async () => {
    let dataCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/auth/refresh/")) return res(200, {});
        dataCalls++;
        return res(401, { detail: "expired" });
      }),
    );

    await expect(new ProbeService().projects()).rejects.toMatchObject({ status: 401 });
    expect(dataCalls).toBe(2); // original + exactly one retry
  });

  it("does NOT refresh on auth-entry endpoints (bad creds, not expiry)", async () => {
    const f = vi.fn(async () => res(401, { detail: "bad creds" }));
    vi.stubGlobal("fetch", f);

    await expect(new ProbeService().signIn()).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1); // no /auth/refresh/ attempt
  });

  it("does not attempt refresh when refresh itself fails, and surfaces the original 401", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(url);
        if (url.endsWith("/auth/refresh/")) return res(401, { detail: "no refresh token" });
        return res(401, { detail: "expired" });
      }),
    );

    await expect(new ProbeService().projects()).rejects.toMatchObject({ status: 401 });
    // original request, one refresh attempt, then give up (no second data retry)
    expect(seen.filter((u) => u.endsWith("/auth/refresh/"))).toHaveLength(1);
  });
});

describe("APIService — error message", () => {
  it("uses the server's string detail so users see why it failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(409, { detail: "Identifier already in use" })));
    await expect(new ProbeService().signIn()).rejects.toMatchObject({
      status: 409,
      message: "Identifier already in use",
    });
  });

  it("falls back to the generic message when detail isn't a string (422 arrays)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(422, { detail: [{ msg: "bad" }] })));
    await expect(new ProbeService().signIn()).rejects.toMatchObject({
      message: "POST /auth/sign-in/ failed with 422",
    });
  });
});
