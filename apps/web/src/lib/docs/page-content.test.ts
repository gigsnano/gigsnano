import { describe, expect, it } from "vitest";
import { looksLikeHtml, pageContentHtml } from "./page-content";

describe("looksLikeHtml", () => {
  it("detects TipTap-style HTML", () => {
    expect(looksLikeHtml("<h1>Runbook</h1><p>Deploy.</p>")).toBe(true);
    expect(looksLikeHtml("<p>hi</p>")).toBe(true);
  });

  it("keeps legacy markdown and plain text out of the HTML path", () => {
    expect(looksLikeHtml("## Welcome\n\nClone the repo.")).toBe(false);
    expect(looksLikeHtml("plain text")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
  });

  it("does not treat lone comparison symbols as HTML", () => {
    expect(looksLikeHtml("a < b and c > d")).toBe(false);
  });
});

describe("pageContentHtml", () => {
  it("passes HTML bodies through untouched", () => {
    expect(pageContentHtml("<h1>Runbook</h1>")).toBe("<h1>Runbook</h1>");
  });

  it("renders a legacy markdown body so the editor never sees raw syntax", () => {
    const html = pageContentHtml("## Welcome\n\nClone the repo.");
    expect(html).toContain("<h2");
    expect(html).toContain("Welcome");
    expect(html).not.toContain("## Welcome");
  });

  it("leaves an empty body empty", () => {
    expect(pageContentHtml("")).toBe("");
  });
});
