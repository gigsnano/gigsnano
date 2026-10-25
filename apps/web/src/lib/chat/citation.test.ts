import { describe, expect, it } from "vitest";
import { parseCitationHref, transformCitations } from "./citation";

describe("transformCitations", () => {
  it("rewrites a code citation to a #gigs-cite fragment link", () => {
    const out = transformCitations("Auth starts in [auth/login.py:42-78] then middleware.");
    expect(out).toContain("[auth/login.py:42-78](#gigs-cite:code:");
    expect(out).toContain(encodeURIComponent("auth/login.py:42-78"));
  });
  it("rewrites a doc citation", () => {
    const out = transformCitations("See [doc:Architecture Overview].");
    expect(out).toContain("[doc:Architecture Overview](#gigs-cite:doc:");
    expect(out).toContain(encodeURIComponent("Architecture Overview"));
  });
  it("leaves a real markdown link untouched", () => {
    const src = "See [the docs](https://example.com/x).";
    expect(transformCitations(src)).toBe(src);
  });
  it("skips a citation inside an inline code span", () => {
    const src = "Write it as `[auth/login.py:42-78]` in prose.";
    expect(transformCitations(src)).toBe(src);
  });
  it("skips a citation inside a fenced block", () => {
    const src = "```\n[auth/login.py:42-78]\n```";
    expect(transformCitations(src)).toBe(src);
  });
  it("ignores a malformed range", () => {
    const src = "Not a cite: [auth/login.py:xx-yy].";
    expect(transformCitations(src)).toBe(src);
  });
  it("returns text unchanged when there are no citations", () => {
    const src = "Just a normal sentence.";
    expect(transformCitations(src)).toBe(src);
  });
});

describe("parseCitationHref", () => {
  it("parses a code href", () => {
    const href = `#gigs-cite:code:${encodeURIComponent("auth/login.py:42-78")}`;
    expect(parseCitationHref(href)).toEqual({ kind: "code", path: "auth/login.py", start: 42, end: 78 });
  });
  it("parses a doc href with spaces", () => {
    const href = `#gigs-cite:doc:${encodeURIComponent("Architecture Overview")}`;
    expect(parseCitationHref(href)).toEqual({ kind: "doc", title: "Architecture Overview" });
  });
  it("returns null for a normal href", () => {
    expect(parseCitationHref("https://example.com")).toBeNull();
  });
});
