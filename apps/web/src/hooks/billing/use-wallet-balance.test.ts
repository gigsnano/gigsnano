import { describe, expect, it } from "vitest";

import { deriveBalanceState } from "./use-wallet";

describe("deriveBalanceState", () => {
  it("flags empty at or below zero", () => {
    expect(deriveBalanceState(0)).toMatchObject({ isEmpty: true, isLow: true });
    expect(deriveBalanceState(-10)).toMatchObject({ isEmpty: true, isLow: true });
  });
  it("flags low at or below the threshold but not empty", () => {
    expect(deriveBalanceState(500)).toMatchObject({ isLow: true, isEmpty: false });
    expect(deriveBalanceState(499)).toMatchObject({ isLow: true, isEmpty: false });
  });
  it("is healthy above the threshold", () => {
    expect(deriveBalanceState(501)).toMatchObject({ isLow: false, isEmpty: false });
    expect(deriveBalanceState(5000)).toMatchObject({ isLow: false, isEmpty: false });
  });
});
