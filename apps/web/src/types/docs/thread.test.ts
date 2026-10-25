import { describe, it, expect } from "vitest";

import { EThreadState, isFinalizedThreadState } from "./thread";

describe("isFinalizedThreadState", () => {
  it("is true for terminal states that 409 further sends", () => {
    expect(isFinalizedThreadState(EThreadState.Completed)).toBe(true);
    expect(isFinalizedThreadState("finalizing")).toBe(true);
  });

  it("is false while the chat can still take turns", () => {
    expect(isFinalizedThreadState(EThreadState.Conversing)).toBe(false);
    expect(isFinalizedThreadState(EThreadState.ReadyToFinalize)).toBe(false);
    expect(isFinalizedThreadState(EThreadState.Failed)).toBe(false);
    expect(isFinalizedThreadState("")).toBe(false);
  });
});
