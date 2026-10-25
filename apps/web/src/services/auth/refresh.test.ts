import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthEntryPath, refreshSession, resetRefreshBackoff } from "./refresh";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRefreshBackoff(); // clear the module-level back-off between tests
});

describe("isAuthEntryPath", () => {
  it("flags credential endpoints — a 401 there is bad creds, never refresh-retry", () => {
    for (const p of [
      "/auth/refresh/",
      "/auth/sign-in/",
      "/auth/sign-up/",
      "/auth/google/",
      "/auth/sign-out/",
    ]) {
      expect(isAuthEntryPath(p)).toBe(true);
    }
  });

  it("does NOT flag session-protected endpoints (a 401 there means expired → refresh)", () => {
    for (const p of ["/auth/me/", "/workspaces/acme/projects/", "/auth/reset-password/"]) {
      expect(isAuthEntryPath(p)).toBe(false);
    }
  });
});

describe("refreshSession — single-flight", () => {
  it("coalesces concurrent callers into ONE network request", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        await gate;
        return { ok: true } as Response;
      }),
    );

    const a = refreshSession("http://api");
    const b = refreshSession("http://api");
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(calls).toBe(1);
    expect(ra).toBe(true);
    expect(rb).toBe(true);
  });

  it("resolves false on network error and frees the lock for a later retry", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true } as Response);
    vi.stubGlobal("fetch", f);

    expect(await refreshSession("http://api")).toBe(false);
    resetRefreshBackoff(); // a failed refresh also arms the back-off; clear it to test the single-flight lock
    expect(await refreshSession("http://api")).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("resolves false on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 }) as Response));
    expect(await refreshSession("http://api")).toBe(false);
  });

  it("backs off after a failure — a second call in the window skips the network", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 429 }) as Response);
    vi.stubGlobal("fetch", f);
    expect(await refreshSession("http://api")).toBe(false); // hits the network, arms back-off
    expect(await refreshSession("http://api")).toBe(false); // blocked by back-off
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("resetRefreshBackoff re-enables refresh after a failure", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    vi.stubGlobal("fetch", f);
    expect(await refreshSession("http://api")).toBe(false);
    resetRefreshBackoff();
    expect(await refreshSession("http://api")).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("POSTs the refresh endpoint with credentials included", async () => {
    const f = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", f);
    await refreshSession("http://api/base");
    expect(f).toHaveBeenCalledWith(
      "http://api/base/auth/refresh/",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
