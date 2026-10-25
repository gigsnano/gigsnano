import { EPlanTier } from "@/constants/plans";
import { ENTITLEMENT_CATALOG } from "@/constants/entitlements-catalog";
import type { IEntitlement } from "@/types";

const RANK: Record<EPlanTier, number> = {
  [EPlanTier.Free]: 0,
  [EPlanTier.Pro]: 1,
  [EPlanTier.Business]: 2,
};

export function tierRank(tier: EPlanTier): number {
  return RANK[tier];
}

/** Whether a tier includes a capability key (unknown key = allowed). */
export function isAvailable(tier: EPlanTier, key: string): boolean {
  const def = ENTITLEMENT_CATALOG[key];
  return def ? tierRank(tier) >= tierRank(def.minTier) : true;
}

/**
 * Compute the entitlement summary for a tier from the catalog — the same shape
 * the backend `entitlement_summary` returns. `used` supplies per-key metered
 * counts (default 0).
 */
export function computeSummary(tier: EPlanTier, used: Record<string, number> = {}): IEntitlement[] {
  return Object.entries(ENTITLEMENT_CATALOG).map(([key, def]) => {
    const metered = Boolean(def.quotas);
    const quota = metered ? (def.quotas?.[tier] ?? null) : null;
    return {
      key,
      available: isAvailable(tier, key),
      metered,
      quota,
      used: metered ? (used[key] ?? 0) : 0,
    };
  });
}

export type TMeterLevel = "ok" | "near" | "over";

/** Meter state for a metered entitlement. `quota === null` → unlimited. */
export function meterState(used: number, quota: number | null): {
  level: TMeterLevel;
  pct: number;
  unlimited: boolean;
} {
  if (quota === null) return { level: "ok", pct: 0, unlimited: true };
  const pct = quota <= 0 ? 100 : Math.min(100, Math.round((used / quota) * 100));
  const level: TMeterLevel = used >= quota ? "over" : used / quota >= 0.8 ? "near" : "ok";
  return { level, pct, unlimited: false };
}
