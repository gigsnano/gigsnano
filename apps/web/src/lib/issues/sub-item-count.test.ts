import { describe, expect, it } from "vitest";

import { subItemCount } from "./sub-item-count";

describe("subItemCount", () => {
  it("shows a bare count when nothing is hidden", () => {
    expect(subItemCount(3, 3)).toEqual({ label: "3", spoken: "3", hidden: false });
  });

  it("shows the compact and spoken forms when the filter hides matches", () => {
    expect(subItemCount(3, 7)).toEqual({ label: "3/7", spoken: "3 of 7", hidden: true });
  });

  it("clamps a stale-low total instead of rendering an impossible fraction", () => {
    // sub_issue_count can lag the real children — never show "3/1".
    expect(subItemCount(3, 1)).toEqual({ label: "3", spoken: "3", hidden: false });
  });

  it("handles a single child", () => {
    expect(subItemCount(1, 1)).toEqual({ label: "1", spoken: "1", hidden: false });
  });

  it("caps the on-row label past one digit but keeps the spoken form exact", () => {
    // The label must never overflow its fixed w-12 slot; the spoken form is
    // for a screen reader, which should hear the real numbers either way.
    expect(subItemCount(127, 340)).toEqual({
      label: "9+/9+",
      spoken: "127 of 340",
      hidden: true,
    });
  });

  it("caps only the side that needs it", () => {
    expect(subItemCount(3, 150)).toEqual({
      label: "3/9+",
      spoken: "3 of 150",
      hidden: true,
    });
  });

  it("caps a bare (non-hidden) count too", () => {
    expect(subItemCount(150, 150)).toEqual({
      label: "9+",
      spoken: "150",
      hidden: false,
    });
  });

  it("never renders a label wider than the slot can hold", () => {
    // The regression this cap exists to prevent: 5 glyphs is what fits 32px at
    // text-[11px]. Any input, however large, must stay within that.
    for (const [m, t] of [[1, 1], [9, 9], [10, 10], [99, 100], [4, 12], [1234, 99999]]) {
      expect(subItemCount(m!, t!).label.length).toBeLessThanOrEqual(5);
    }
  });
});
