import { describe, it, expect } from "vitest";
import { EPlanTier } from "@/constants/plans";
import { resolveMockPlanTier } from "./subscription";

describe("resolveMockPlanTier", () => {
  it("defaults to Business when no override", () => {
    expect(resolveMockPlanTier(null)).toBe(EPlanTier.Business);
    expect(resolveMockPlanTier(undefined)).toBe(EPlanTier.Business);
  });
  it("honors a valid override", () => {
    expect(resolveMockPlanTier("free")).toBe(EPlanTier.Free);
    expect(resolveMockPlanTier("pro")).toBe(EPlanTier.Pro);
  });
  it("ignores garbage and falls back to Business", () => {
    expect(resolveMockPlanTier("enterprise")).toBe(EPlanTier.Business);
  });
});
