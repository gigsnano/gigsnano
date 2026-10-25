import { describe, expect, it } from "vitest";

import { formatEstimateRange } from "./estimate-hint";

describe("formatEstimateRange", () => {
  it("renders a sub-dollar range in dollars", () => {
    expect(formatEstimateRange(10, 30)).toBe("$0.10–0.30");
  });
  it("renders a dollar range", () => {
    expect(formatEstimateRange(150, 300)).toBe("$1.50–3.00");
  });
  it("uses one unit across the dollar boundary", () => {
    // Was "¢50–$1.50" — the reason the same-unit branch existed. One unit, no branch.
    expect(formatEstimateRange(50, 150)).toBe("$0.50–1.50");
  });
  it("collapses equal bounds to a single figure", () => {
    expect(formatEstimateRange(18, 18)).toBe("$0.18");
  });
  it("never renders a nonzero low bound as free", () => {
    expect(formatEstimateRange(0.4, 8)).toBe("<$0.01–0.08");
  });
});
