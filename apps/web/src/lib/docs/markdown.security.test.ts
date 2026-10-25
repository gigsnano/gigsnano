/**
 * GIN-306 security fixtures for the document Markdown renderer.
 *
 * `renderSimpleMarkdown` output goes straight to a `dangerouslySetInnerHTML`
 * sink (components/docs/document-blocks.tsx), so its escaping is the whole
 * defence there. Every hostile-input branch must HTML-escape before layering on
 * its own markup — this is the same passthrough class GIN-117/GIN-134 narrowed
 * on the backend and GIN-354 fixed at the history-diff sink.
 */

import { describe, expect, it } from "vitest";

import { renderSimpleMarkdown } from "./markdown";

const XSS_INPUTS = [
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<svg onload="alert(1)">',
  '<a href="javascript:alert(1)">click</a>',
];

describe("renderSimpleMarkdown escapes hostile input", () => {
  for (const input of XSS_INPUTS) {
    it(`neutralizes ${input.slice(0, 24)}…`, () => {
      const html = renderSimpleMarkdown(input);
      // No LIVE tag survives — it is escaped to &lt;… so the browser renders it
      // as text. (The substring "onerror" still appears, but inside the escaped
      // &lt;img …&gt; text where it is inert, so we assert on the tag, not it.)
      expect(html).not.toMatch(/<script|<img|<iframe|<svg|<a\b/i);
      expect(html).toContain("&lt;");
    });
  }

  it("escapes HTML inside a table cell rather than emitting it", () => {
    const html = renderSimpleMarkdown("| a | b |\n| --- | --- |\n| <img src=x onerror=alert(1)> | y |");
    expect(html).toContain("<table");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("still renders the safe markdown it is meant to (regression guard)", () => {
    const html = renderSimpleMarkdown("# Title\n\n- **bold** and `code`");
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code");
  });
});
