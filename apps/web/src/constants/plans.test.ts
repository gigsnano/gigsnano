import { describe, it, expect } from "vitest";
import {
  EPlanTier, EEntitlementFeature, EEntitlementLimit, PLAN_TIERS, PLAN_TIER_ORDER,
  annualTotalCents, annualMonthlyEquivalentCents,
} from "./plans";

describe("PLAN_TIERS matrix", () => {
  it("has exactly Free, Pro, Business in order", () => {
    expect(PLAN_TIER_ORDER).toEqual([EPlanTier.Free, EPlanTier.Pro, EPlanTier.Business]);
  });

  it("Free caps: 5 seats, 3 projects, 500 AI credits", () => {
    const f = PLAN_TIERS[EPlanTier.Free].limits;
    expect(f[EEntitlementLimit.Seats]).toBe(5);
    expect(f[EEntitlementLimit.Projects]).toBe(3);
    expect(f[EEntitlementLimit.AiCreditsPerSeat]).toBe(500);
  });

  it("Pro/Business seats & projects are unlimited (null)", () => {
    for (const t of [EPlanTier.Pro, EPlanTier.Business]) {
      expect(PLAN_TIERS[t].limits[EEntitlementLimit.Seats]).toBeNull();
      expect(PLAN_TIERS[t].limits[EEntitlementLimit.Projects]).toBeNull();
    }
  });

  it("Free grants no gated features; Business grants SSO; Pro does not", () => {
    expect(PLAN_TIERS[EPlanTier.Free].features).toHaveLength(0);
    expect(PLAN_TIERS[EPlanTier.Business].features).toContain(EEntitlementFeature.Sso);
    expect(PLAN_TIERS[EPlanTier.Pro].features).not.toContain(EEntitlementFeature.Sso);
  });

  it("Pro grants advanced analytics + webhooks is Business-only", () => {
    expect(PLAN_TIERS[EPlanTier.Pro].features).toContain(EEntitlementFeature.AdvancedAnalytics);
    expect(PLAN_TIERS[EPlanTier.Pro].features).not.toContain(EEntitlementFeature.Webhooks);
    expect(PLAN_TIERS[EPlanTier.Business].features).toContain(EEntitlementFeature.Webhooks);
  });

  it("annual pricing = 10 months billed, rounded monthly equivalent", () => {
    expect(annualTotalCents(800)).toBe(8000);
    expect(annualMonthlyEquivalentCents(800)).toBe(667);
  });
});
