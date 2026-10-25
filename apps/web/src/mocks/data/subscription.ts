import { EPlanTier, EBillingInterval } from "@/constants/plans";
import { ESubscriptionStatus, type ISubscription } from "@/types/billing/subscription";
import { workspaceMembers } from "./workspaces";

const VALID = new Set<string>(Object.values(EPlanTier));

/**
 * Dev-only tier override. The mock defaults to Business so gating never
 * regresses the running app; flip via `localStorage.setItem("gn_mock_plan","free")`.
 */
export function resolveMockPlanTier(override: string | null | undefined): EPlanTier {
  return override && VALID.has(override) ? (override as EPlanTier) : EPlanTier.Business;
}

function readOverride(): string | null {
  if (typeof window === "undefined") return null; // SSR: no localStorage
  return window.localStorage.getItem("gn_mock_plan");
}

export function getMockSubscription(slug: string): ISubscription {
  const tier = resolveMockPlanTier(readOverride());
  const seatsUsed = workspaceMembers.filter((m) => m.workspace_slug === slug).length || 1;
  return {
    tier,
    interval: EBillingInterval.Monthly,
    status: ESubscriptionStatus.Active,
    seats_used: seatsUsed,
    current_period_end: tier === EPlanTier.Free ? null : "2026-08-12T00:00:00Z",
  };
}
