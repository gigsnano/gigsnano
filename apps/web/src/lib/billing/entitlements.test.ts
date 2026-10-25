import { describe, it, expect } from "vitest";
import { EPlanTier, EEntitlementFeature, EEntitlementLimit } from "@/constants/plans";
import { hasFeature, limitFor, isWithinLimit, remaining, limitStatus } from "./entitlements";

describe("hasFeature", () => {
  it("Free denies every gated feature", () => {
    for (const f of Object.values(EEntitlementFeature)) {
      expect(hasFeature(EPlanTier.Free, f)).toBe(false);
    }
  });
  it("Pro allows advanced analytics but not webhooks", () => {
    expect(hasFeature(EPlanTier.Pro, EEntitlementFeature.AdvancedAnalytics)).toBe(true);
    expect(hasFeature(EPlanTier.Pro, EEntitlementFeature.Webhooks)).toBe(false);
  });
  it("Business allows webhooks and SSO", () => {
    expect(hasFeature(EPlanTier.Business, EEntitlementFeature.Webhooks)).toBe(true);
    expect(hasFeature(EPlanTier.Business, EEntitlementFeature.Sso)).toBe(true);
  });
});

describe("limits", () => {
  it("Free seats cap = 5, unlimited on Pro", () => {
    expect(limitFor(EPlanTier.Free, EEntitlementLimit.Seats)).toBe(5);
    expect(limitFor(EPlanTier.Pro, EEntitlementLimit.Seats)).toBeNull();
  });
  it("isWithinLimit: under/at/over on Free seats(5)", () => {
    expect(isWithinLimit(EPlanTier.Free, EEntitlementLimit.Seats, 4)).toBe(true);  // adding 5th ok
    expect(isWithinLimit(EPlanTier.Free, EEntitlementLimit.Seats, 5)).toBe(false); // at cap: block add
    expect(isWithinLimit(EPlanTier.Free, EEntitlementLimit.Seats, 6)).toBe(false);
  });
  it("unlimited tier is always within limit", () => {
    expect(isWithinLimit(EPlanTier.Pro, EEntitlementLimit.Projects, 9999)).toBe(true);
  });
  it("remaining clamps at 0 and is null when unlimited", () => {
    expect(remaining(EPlanTier.Free, EEntitlementLimit.Projects, 1)).toBe(2);
    expect(remaining(EPlanTier.Free, EEntitlementLimit.Projects, 5)).toBe(0);
    expect(remaining(EPlanTier.Business, EEntitlementLimit.Projects, 5)).toBeNull();
  });
  it("limitStatus reports atLimit", () => {
    expect(limitStatus(EPlanTier.Free, EEntitlementLimit.Projects, 3)).toEqual({
      limit: 3, used: 3, remaining: 0, atLimit: true,
    });
    expect(limitStatus(EPlanTier.Pro, EEntitlementLimit.Projects, 3)).toEqual({
      limit: null, used: 3, remaining: null, atLimit: false,
    });
  });
});
