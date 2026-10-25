import { describe, expect, it } from "vitest";

import { stripHtmlToText } from "./strip-html";

describe("stripHtmlToText", () => {
  it("drops tags and keeps text", () => {
    expect(stripHtmlToText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("decodes common entities", () => {
    expect(stripHtmlToText("A &amp; B &lt;ok&gt; &nbsp;&#39;x&#39;")).toBe("A & B <ok> 'x'");
  });

  it("collapses whitespace across block tags", () => {
    expect(stripHtmlToText("<h1>Title</h1>\n<p>Body\n  line</p>")).toBe("Title Body line");
  });

  it("never returns markup for hostile input (display-only, not a sanitizer)", () => {
    // Tag-strip removes elements; inner text survives as plain text (safe — React
    // escapes it on render). What must never survive is the markup itself.
    const out = stripHtmlToText('<img src=x onerror="alert(1)"><script>danger</script>hi');
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toBe("danger hi");
  });

  it("handles empty / nullish", () => {
    expect(stripHtmlToText("")).toBe("");
    expect(stripHtmlToText(null)).toBe("");
    expect(stripHtmlToText(undefined)).toBe("");
  });
});
