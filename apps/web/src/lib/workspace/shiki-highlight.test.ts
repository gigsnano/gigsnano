import { describe, expect, it } from "vitest";

import { sliceRange, stripPreCodeWrapper } from "./shiki-highlight";

describe("sliceRange", () => {
  const content = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n");

  it("slices an inclusive 1-based range", () => {
    expect(sliceRange(content, 3, 5).text).toBe("line3\nline4\nline5");
    expect(sliceRange(content, 3, 5).truncated).toBe(false);
  });

  it("clamps and marks truncation past the cap", () => {
    const r = sliceRange(content, 1, 10, 4);
    expect(r.text.split("\n")).toHaveLength(4);
    expect(r.truncated).toBe(true);
  });

  it("clamps start below 1 and end past the file length", () => {
    expect(sliceRange(content, -3, 3).text).toBe("line1\nline2\nline3");
    expect(sliceRange(content, 8, 50).text).toBe("line8\nline9\nline10");
  });
});

describe("stripPreCodeWrapper", () => {
  it("removes the outer pre/code tags but keeps the line spans", () => {
    const html =
      '<pre class="shiki github-light" style="background-color:#fff"><code>' +
      '<span class="line"><span style="color:#111">a</span></span>\n' +
      '<span class="line"><span style="color:#222">b</span></span>' +
      "</code></pre>";
    const stripped = stripPreCodeWrapper(html);
    expect(stripped).not.toMatch(/<\/?(pre|code)[\s>]/);
    expect(stripped).toContain('<span class="line"><span style="color:#111">a</span></span>');
    expect(stripped).toContain('<span class="line"><span style="color:#222">b</span></span>');
  });

  it("returns html unchanged when the wrapper shape isn't found", () => {
    const html = '<span class="line">already unwrapped</span>';
    expect(stripPreCodeWrapper(html)).toBe(html);
  });
});
