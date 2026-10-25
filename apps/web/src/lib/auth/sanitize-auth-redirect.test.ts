import { describe, expect, it } from "vitest";

import { sanitizeAuthRedirect } from "./sanitize-auth-redirect";

describe("sanitizeAuthRedirect", () => {
  const fallback = "/onboarding";

  it("returns fallback when next is missing", () => {
    expect(sanitizeAuthRedirect(null, fallback)).toBe(fallback);
    expect(sanitizeAuthRedirect(undefined, fallback)).toBe(fallback);
    expect(sanitizeAuthRedirect("", fallback)).toBe(fallback);
  });

  it("allows same-origin relative paths", () => {
    expect(sanitizeAuthRedirect("/acme", fallback)).toBe("/acme");
    expect(sanitizeAuthRedirect("/acme/projects/p1/issues", fallback)).toBe(
      "/acme/projects/p1/issues",
    );
    expect(sanitizeAuthRedirect("/acme?tab=settings", fallback)).toBe(
      "/acme?tab=settings",
    );
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(sanitizeAuthRedirect("https://evil.com", fallback)).toBe(fallback);
    expect(sanitizeAuthRedirect("//evil.com", fallback)).toBe(fallback);
    expect(sanitizeAuthRedirect("/\\evil.com", fallback)).toBe(fallback);
    expect(
      sanitizeAuthRedirect("/%2F%2Fevil.com", fallback),
    ).toBe(fallback);
  });

  it("keeps an encoded URL inside the query string", () => {
    const next = "/mobile-auth?challenge=c&redirect_uri=gigsnano%3A%2F%2Fauth";
    expect(sanitizeAuthRedirect(next, fallback)).toBe(next);
    expect(sanitizeAuthRedirect("/%2F%2Fevil.com?x=1", fallback)).toBe(fallback);
  });

  it("rejects dangerous pseudo-protocol paths", () => {
    expect(sanitizeAuthRedirect("/javascript:alert(1)", fallback)).toBe(
      fallback,
    );
  });
});
