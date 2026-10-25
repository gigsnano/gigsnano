import { describe, it, expect } from "vitest";

import { htmlToPlainText } from "./html-to-text";

describe("htmlToPlainText", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToPlainText("")).toBe("");
  });

  it("keeps headings and paragraphs on separate lines", () => {
    const html = "<h3>Summary</h3><p>Design and implement an audit forms system.</p>";
    expect(htmlToPlainText(html)).toBe(
      "Summary\nDesign and implement an audit forms system.",
    );
  });

  it("does not mash adjacent sections into one line", () => {
    const html =
      "<h3>Summary</h3><p>Build it.</p><h3>Acceptance Criteria</h3><p>Define fields.</p>";
    const out = htmlToPlainText(html);
    // The old naive strip produced 'Summary Build it. Acceptance Criteria ...'
    expect(out).not.toContain("Build it. Acceptance Criteria");
    expect(out.split("\n")).toContain("Acceptance Criteria");
  });

  it("turns list items into bullets", () => {
    const html = "<ul><li>Create form templates</li><li>Ensure forms save</li></ul>";
    expect(htmlToPlainText(html)).toBe("• Create form templates\n• Ensure forms save");
  });

  it("collapses excess blank lines and intra-line whitespace", () => {
    const html = "<p>a</p><p></p><p></p><p>b   c</p>";
    expect(htmlToPlainText(html)).toBe("a\n\nb c");
  });

  it("decodes common entities", () => {
    expect(htmlToPlainText("<p>Forms &amp; audits &quot;v2&quot;</p>")).toBe(
      'Forms & audits "v2"',
    );
  });
});
