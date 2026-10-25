import { describe, expect, it } from "vitest";

import { resolveAuthRedirect } from "./post-auth-redirect";

describe("resolveAuthRedirect", () => {
  const origin = "https://app.gigsnano.com";
  const fallback = "/onboarding";

  it("falls back when next is missing", () => {
    expect(resolveAuthRedirect(null, fallback, origin)).toEqual({
      url: fallback,
      hardNavigate: false,
    });
  });

  it("routes internal app paths through the client router", () => {
    expect(resolveAuthRedirect("/acme/projects", fallback, origin)).toEqual({
      url: "/acme/projects",
      hardNavigate: false,
    });
  });

  it("full-page navigates a same-origin absolute /oauth/authorize URL", () => {
    const next = `${origin}/oauth/authorize?client_id=c_1&state=s`;
    expect(resolveAuthRedirect(next, fallback, origin)).toEqual({
      url: "/oauth/authorize?client_id=c_1&state=s",
      hardNavigate: true,
    });
  });

  it("full-page navigates a relative /oauth path", () => {
    expect(resolveAuthRedirect("/oauth/authorize?x=1", fallback, origin)).toEqual({
      url: "/oauth/authorize?x=1",
      hardNavigate: true,
    });
  });

  it("rejects cross-origin absolute URLs (open-redirect guard)", () => {
    expect(resolveAuthRedirect("https://evil.com/oauth/authorize", fallback, origin)).toEqual({
      url: fallback,
      hardNavigate: false,
    });
  });
});
