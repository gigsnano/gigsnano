"use client";

import { useParams } from "next/navigation";

import { ENTITLEMENT_CATALOG } from "@/constants/entitlements-catalog";
import { PLAN_TIERS } from "@/constants/plans";
import { useEntitlement } from "@/hooks/billing/use-entitlement-summary";

import { UpgradeNudge } from "../upgrade-nudge";

interface IEntitlementGateProps {
  /** Server entitlement key, e.g. "task_router" (see entitlements-catalog). */
  feature: string;
  /** "lock" shows the upgrade nudge in place; "hide" renders nothing. */
  mode?: "lock" | "hide";
  children: React.ReactNode;
}

/**
 * Gates children on a server-driven capability. While the plan resolves it
 * renders children optimistically (the backend still enforces the 402), then
 * swaps to a consistent locked/upgrade state if the plan doesn't include it.
 */
export function EntitlementGate({ feature, mode = "lock", children }: IEntitlementGateProps) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { available, isLoading } = useEntitlement(workspaceSlug, feature);

  if (isLoading || available) return <>{children}</>;
  if (mode === "hide") return null;

  const def = ENTITLEMENT_CATALOG[feature];
  const tierName = def ? PLAN_TIERS[def.minTier].name : "a higher plan";
  return (
    <UpgradeNudge
      locked
      title={def ? `${def.label} is a ${tierName} feature` : "Upgrade to unlock this"}
      description={def?.description}
    />
  );
}
