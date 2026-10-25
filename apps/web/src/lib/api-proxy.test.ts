import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxyApiRequest } from "@/lib/api-proxy";

describe("proxyApiRequest", () => {
  const upstream = vi.fn();

  beforeEach(() => {
    vi.stubEnv("API_PROXY_TARGET", "https://api.example.test/api");
    upstream.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    upstream.mockReset();
  });

  function forwardedHeaders(): Headers {
    return upstream.mock.calls[0][1].headers as Headers;
  }

  it("forwards the mobile app's bearer token", async () => {
    const request = new Request("https://app.example.test/api/workspaces/", {
      headers: { authorization: "Bearer abc.def.ghi" },
    });
    await proxyApiRequest(request, ["workspaces"]);
    expect(upstream.mock.calls[0][0]).toBe("https://api.example.test/api/workspaces/");
    expect(forwardedHeaders().get("authorization")).toBe("Bearer abc.def.ghi");
  });

  it("still forwards the web session cookie and omits absent headers", async () => {
    const request = new Request("https://app.example.test/api/auth/me/", {
      headers: { cookie: "gn_access=x" },
    });
    await proxyApiRequest(request, ["auth", "me"]);
    expect(forwardedHeaders().get("cookie")).toBe("gn_access=x");
    expect(forwardedHeaders().has("authorization")).toBe(false);
  });
});
