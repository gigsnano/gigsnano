"use client";

import { useParams } from "next/navigation";

import type { EEntitlementLimit } from "@/constants/plans";
import { useLimitStatus } from "@/hooks/billing/use-entitlements";

import { UpgradeNudge } from "../upgrade-nudge";

interface ILimitGateProps {
  cap: EEntitlementLimit;
  count: number;
  mode?: "lock" | "hide";
  children: React.ReactNode;
  nudgeTitle?: string;
  nudgeDescription?: string;
}

/** Renders children while under the cap; at the cap shows a nudge (or hides). */
export function LimitGate({
  cap,
  count,
  mode = "lock",
  children,
  nudgeTitle,
  nudgeDescription,
}: ILimitGateProps) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { atLimit } = useLimitStatus(workspaceSlug, cap, count);
  if (!atLimit) return <>{children}</>;
  if (mode === "hide") return null;
  return <UpgradeNudge title={nudgeTitle} description={nudgeDescription} />;
}
