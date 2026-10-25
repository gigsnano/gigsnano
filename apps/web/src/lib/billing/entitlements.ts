import {
  EPlanTier, EEntitlementFeature, EEntitlementLimit, PLAN_TIERS,
} from "@/constants/plans";

/** Is `feature` granted on `tier`? */
export function hasFeature(tier: EPlanTier, feature: EEntitlementFeature): boolean {
  return PLAN_TIERS[tier].features.includes(feature);
}

/** Numeric cap for `cap` on `tier`; `null` = unlimited. */
export function limitFor(tier: EPlanTier, cap: EEntitlementLimit): number | null {
  return PLAN_TIERS[tier].limits[cap];
}

/**
 * Can one more be added when `count` already exist? Unlimited → always true.
 * At-or-over the cap → false (so `count === limit` blocks the next add).
 */
export function isWithinLimit(tier: EPlanTier, cap: EEntitlementLimit, count: number): boolean {
  const limit = limitFor(tier, cap);
  return limit === null || count < limit;
}

/** How many more are allowed; `null` = unlimited, never negative. */
export function remaining(tier: EPlanTier, cap: EEntitlementLimit, count: number): number | null {
  const limit = limitFor(tier, cap);
  if (limit === null) return null;
  return Math.max(0, limit - count);
}

export interface ILimitStatus {
  limit: number | null;
  used: number;
  remaining: number | null;
  atLimit: boolean;
}

export function limitStatus(tier: EPlanTier, cap: EEntitlementLimit, count: number): ILimitStatus {
  const limit = limitFor(tier, cap);
  return {
    limit,
    used: count,
    remaining: remaining(tier, cap, count),
    atLimit: !isWithinLimit(tier, cap, count),
  };
}
