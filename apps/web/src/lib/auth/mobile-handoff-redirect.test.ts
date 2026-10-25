import { describe, expect, it } from "vitest";

import { expoDevHost, handoffRedirectUrl, isHandoffRejection } from "./mobile-handoff-redirect";

describe("handoffRedirectUrl", () => {
  it("appends an encoded code and state", () => {
    expect(handoffRedirectUrl("gigsnano://auth", "a+b", "s/1")).toBe("gigsnano://auth?code=a%2Bb&state=s%2F1");
  });
  it("extends an existing query", () => {
    expect(handoffRedirectUrl("exp://192.168.1.2:8081/--/auth?x=1", "c", "s")).toBe(
      "exp://192.168.1.2:8081/--/auth?x=1&code=c&state=s",
    );
  });
});

describe("isHandoffRejection", () => {
  it("recognises the structured codes", () => {
    expect(isHandoffRejection({ status: 400, code: "invalid_redirect" })).toBe(true);
    expect(isHandoffRejection({ status: 400, data: { detail: { code: "invalid_challenge" } } })).toBe(true);
    expect(isHandoffRejection({ status: 400, data: { code: "invalid_redirect" } })).toBe(true);
  });
  it("ignores other failures", () => {
    expect(isHandoffRejection({ status: 429 })).toBe(false);
    expect(isHandoffRejection({ status: 400, code: "other" })).toBe(false);
    expect(isHandoffRejection(new Error("x"))).toBe(false);
    expect(isHandoffRejection(null)).toBe(false);
  });
});

describe("expoDevHost", () => {
  it("returns host:port for an exp:// redirect", () => {
    expect(expoDevHost("exp://192.168.1.2:8081/--/auth")).toBe("192.168.1.2:8081");
  });
  it("returns null for a non-Expo redirect", () => {
    expect(expoDevHost("gigsnano://auth")).toBeNull();
  });
  it("falls back to a regex when URL parsing fails", () => {
    expect(expoDevHost("exp://bad host:8081/x")).toBe("bad host:8081");
  });
});
