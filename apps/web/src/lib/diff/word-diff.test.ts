import { describe, expect, it } from "vitest";
import { diffDescription } from "./word-diff";

describe("diffDescription", () => {
  it("marks added and removed words on normalized text", () => {
    const segs = diffDescription("<p>ship v1 by Friday</p>", "<p>ship v2 by Tuesday</p>");
    const removed = segs.filter((s) => s.removed).map((s) => s.value.trim());
    const added = segs.filter((s) => s.added).map((s) => s.value.trim());
    expect(removed.join(" ")).toContain("v1");
    expect(added.join(" ")).toContain("v2");
    expect(removed.join(" ")).toContain("Friday");
    expect(added.join(" ")).toContain("Tuesday");
  });

  it("strips tags so identical prose yields no changes", () => {
    const segs = diffDescription("<p><b>hello</b> world</p>", "<p>hello world</p>");
    expect(segs.some((s) => s.added || s.removed)).toBe(false);
  });

  it("handles empty old (first write)", () => {
    const segs = diffDescription("", "<p>new content</p>");
    expect(segs.every((s) => s.added || (!s.added && !s.removed))).toBe(true);
    expect(segs.filter((s) => s.added).map((s) => s.value).join("")).toContain("new content");
  });
});
