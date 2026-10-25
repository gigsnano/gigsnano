import { describe, expect, it } from "vitest";

import { EAiOperation } from "@/types/billing/ai-cost";
import { estimateCost } from "./estimate";

describe("estimateCost", () => {
  it("returns the catalog range with a human basis", () => {
    // Deliberately not pinning the numbers: the catalog is refreshed by re-measuring
    // prod, and a test that asserts today's figures just breaks on every refresh
    // without catching a real defect.
    const e = estimateCost(EAiOperation.Prd);
    expect(e.basis).toBe("PRD generation");
    expect(e.typical_cents).toBeGreaterThan(0);
  });
  it("returns an entry for every operation with low <= typical <= high", () => {
    for (const op of Object.values(EAiOperation)) {
      const e = estimateCost(op);
      expect(e.low_cents).toBeLessThanOrEqual(e.typical_cents);
      expect(e.typical_cents).toBeLessThanOrEqual(e.high_cents);
    }
  });
});
