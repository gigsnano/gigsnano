import { describe, expect, it } from "vitest";

import { hasRichText, parseRichText } from "./rich-text";

describe("parseRichText", () => {
  it("splits paragraphs and keeps inline bold", () => {
    expect(parseRichText("<p><b>Goal:</b> Make it work.</p><p>Second</p>")).toEqual([
      { kind: "p", spans: [{ text: "Goal:", bold: true }, { text: " Make it work." }] },
      { kind: "p", spans: [{ text: "Second" }] },
    ]);
  });

  it("unwraps entity-escaped HTML once", () => {
    expect(parseRichText("&lt;p&gt;&lt;b&gt;Why:&lt;/b&gt; code &amp;amp; docs&lt;/p&gt;")).toEqual([
      { kind: "p", spans: [{ text: "Why:", bold: true }, { text: " code & docs" }] },
    ]);
  });

  it("unwraps escaped HTML inside a plain <p> wrapper", () => {
    expect(parseRichText("<p>&lt;p&gt;&lt;b&gt;Goal:&lt;/b&gt; Link code.&lt;/p&gt; &lt;p&gt;Next&lt;/p&gt;</p>")).toEqual([
      { kind: "p", spans: [{ text: "Goal:", bold: true }, { text: " Link code." }] },
      { kind: "p", spans: [{ text: "Next" }] },
    ]);
  });

  it("leaves real markup that merely mentions an escaped tag alone", () => {
    expect(parseRichText("<p>Use <code>&lt;br&gt;</code> here</p>")).toEqual([
      { kind: "p", spans: [{ text: "Use " }, { text: "<br>", code: true }, { text: " here" }] },
    ]);
  });

  it("numbers ordered items and nests bullets", () => {
    const blocks = parseRichText("<ol><li>One</li><li>Two<ul><li>Sub</li></ul></li></ol>");
    expect(blocks.map((b) => [b.kind, b.marker, b.depth, b.spans[0]?.text])).toEqual([
      ["li", "1.", 1, "One"],
      ["li", "2.", 1, "Two"],
      ["li", "•", 2, "Sub"],
    ]);
  });

  it("keeps safe links and drops unsafe ones", () => {
    const [block] = parseRichText('<p><a href="https://x.dev">site</a> <a href="javascript:alert(1)">bad</a></p>');
    expect(block.spans).toEqual([{ text: "site", href: "https://x.dev" }, { text: " bad" }]);
  });

  it("nests italic inside bold", () => {
    const [block] = parseRichText("<p><strong>a <em>b</em></strong></p>");
    expect(block.spans).toEqual([
      { text: "a ", bold: true },
      { text: "b", bold: true, italic: true },
    ]);
  });

  it("reads headings, breaks and whitespace", () => {
    expect(parseRichText("<h2>Plan</h2>\n<p>line one<br>line   two</p>")).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "Plan" }] },
      { kind: "p", spans: [{ text: "line one\nline two" }] },
    ]);
  });

  it("treats a paragraph inside a list item as part of the item", () => {
    expect(parseRichText("<ul><li><p>Item</p></li></ul>")).toEqual([
      { kind: "li", depth: 1, marker: "•", spans: [{ text: "Item" }] },
    ]);
  });

  it("drops scripts and empty blocks", () => {
    expect(parseRichText("<p> </p><script>x()</script><p>ok</p>")).toEqual([{ kind: "p", spans: [{ text: "ok" }] }]);
  });

  it("splits plain text on blank lines", () => {
    expect(parseRichText("first\nstill first\n\nsecond")).toEqual([
      { kind: "p", spans: [{ text: "first\nstill first" }] },
      { kind: "p", spans: [{ text: "second" }] },
    ]);
  });

  it("handles empty input", () => {
    expect(parseRichText("")).toEqual([]);
  });

  it("reports whether there is anything to show", () => {
    expect(hasRichText("<p> </p>")).toBe(false);
    expect(hasRichText(null)).toBe(false);
    expect(hasRichText("<p>hi</p>")).toBe(true);
  });
});
