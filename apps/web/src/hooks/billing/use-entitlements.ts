import { EPlanTier, type EEntitlementFeature, type EEntitlementLimit } from "@/constants/plans";
import { hasFeature, limitFor, limitStatus, type ILimitStatus } from "@/lib/billing/entitlements";

import { useSubscription } from "./use-subscription";

/**
 * Entitlement checks for the current workspace. While loading, falls back to the
 * top tier (Business) so nothing flickers locked before the plan resolves.
 */
export function useEntitlements(workspaceSlug: string) {
  const { data, isLoading } = useSubscription(workspaceSlug);
  const tier = data?.tier ?? EPlanTier.Business;
  return {
    tier,
    isLoading,
    has: (feature: EEntitlementFeature) => hasFeature(tier, feature),
    limit: (cap: EEntitlementLimit) => limitFor(tier, cap),
    status: (cap: EEntitlementLimit, count: number): ILimitStatus => limitStatus(tier, cap, count),
  };
}

/** Convenience for count-gated actions (create project, invite member). */
export function useLimitStatus(
  workspaceSlug: string,
  cap: EEntitlementLimit,
  count: number,
): ILimitStatus & { isLoading: boolean } {
  const { status, isLoading } = useEntitlements(workspaceSlug);
  return { ...status(cap, count), isLoading };
}
