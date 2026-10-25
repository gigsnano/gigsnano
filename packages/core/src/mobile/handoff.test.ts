import { describe, expect, it } from "vitest";

import { handoffUrl, parseHandoffRedirect, toBase64Url } from "./handoff";

describe("toBase64Url", () => {
  it("swaps the alphabet and strips padding", () => {
    expect(toBase64Url("ab+/cd==")).toBe("ab-_cd");
    expect(toBase64Url("abc=")).toBe("abc");
  });
});

describe("handoffUrl", () => {
  it("builds the web page URL with encoded params", () => {
    const url = handoffUrl("https://app.gigsnano.com/", {
      challenge: "chal-_1",
      state: "st",
      redirectUri: "gigsnano://auth",
    });
    expect(url).toBe(
      "https://app.gigsnano.com/mobile-auth?challenge=chal-_1&state=st&redirect_uri=gigsnano%3A%2F%2Fauth",
    );
  });
});

describe("parseHandoffRedirect", () => {
  it("returns the code when state matches", () => {
    expect(parseHandoffRedirect("gigsnano://auth?code=abc&state=s1", "s1")).toEqual({ code: "abc" });
  });
  it("rejects a state mismatch", () => {
    expect(parseHandoffRedirect("gigsnano://auth?code=abc&state=zzz", "s1")).toEqual({ error: "state_mismatch" });
  });
  it("rejects a missing state", () => {
    expect(parseHandoffRedirect("gigsnano://auth?code=abc", "s1")).toEqual({ error: "state_mismatch" });
  });
  it("reports a missing code", () => {
    expect(parseHandoffRedirect("gigsnano://auth?state=s1", "s1")).toEqual({ error: "missing_code" });
  });
  it("treats an error param as cancelled", () => {
    expect(parseHandoffRedirect("gigsnano://auth?error=access_denied&state=s1", "s1")).toEqual({ error: "cancelled" });
  });
  it("treats an unparseable url as cancelled", () => {
    expect(parseHandoffRedirect("", "s1")).toEqual({ error: "cancelled" });
  });
});
