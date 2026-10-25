import { describe, expect, it } from "vitest";

import { plainText } from "./plain-text";

describe("plainText", () => {
  it("strips tags", () => {
    expect(plainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });
  it("decodes the basic entities", () => {
    expect(plainText("a &amp; b &lt;c&gt; &quot;d&quot; it&#39;s")).toBe(`a & b <c> "d" it's`);
  });
  it("collapses whitespace", () => {
    expect(plainText("<p>one</p>\n\n  <p>two\t three</p>")).toBe("one two three");
  });
  it("does not double-decode", () => {
    expect(plainText("&amp;lt;")).toBe("&lt;");
  });
  it("handles empty input", () => {
    expect(plainText("")).toBe("");
  });
});
