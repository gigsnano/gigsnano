"use client";

import { useParams } from "next/navigation";

import type { EEntitlementFeature } from "@/constants/plans";
import { useEntitlements } from "@/hooks/billing/use-entitlements";

import { UpgradeNudge } from "../upgrade-nudge";

interface IFeatureGateProps {
  feature: EEntitlementFeature;
  /** "lock" shows an upgrade nudge in place; "hide" renders nothing. */
  mode?: "lock" | "hide";
  children: React.ReactNode;
  nudgeTitle?: string;
  nudgeDescription?: string;
}

export function FeatureGate({
  feature,
  mode = "lock",
  children,
  nudgeTitle,
  nudgeDescription,
}: IFeatureGateProps) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { has } = useEntitlements(workspaceSlug);
  if (has(feature)) return <>{children}</>;
  if (mode === "hide") return null;
  return <UpgradeNudge title={nudgeTitle} description={nudgeDescription} />;
}
