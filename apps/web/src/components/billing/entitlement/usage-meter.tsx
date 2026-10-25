"use client";

import { useParams } from "next/navigation";

import { ENTITLEMENT_CATALOG } from "@/constants/entitlements-catalog";
import { useEntitlement } from "@/hooks/billing/use-entitlement-summary";
import { meterState } from "@/lib/billing/entitlement-summary";
import { cn } from "@/lib/utils";

const BAR_TONE = {
  ok: "bg-primary",
  near: "bg-amber-500",
  over: "bg-red-500",
} as const;

const TEXT_TONE = {
  ok: "text-muted-foreground",
  near: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
} as const;

/** Presentational meter — used quota + a tone-coded bar. Reused by the meter chip
 * and the entitlements overview so both read identically. */
export function MeterBar({
  label,
  used,
  quota,
  className,
}: {
  label: string;
  used: number;
  quota: number | null;
  className?: string;
}) {
  const { level, pct, unlimited } = meterState(used, quota);
  return (
    <div className={cn("min-w-44", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("tabular-nums", TEXT_TONE[level])}>
          {unlimited ? "Unlimited" : `${used} / ${quota} this month`}
        </span>
      </div>
      {!unlimited ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", BAR_TONE[level])}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      {level === "over" ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          Over your monthly limit — extra runs are billed per use.
        </p>
      ) : level === "near" ? (
        <p className="mt-1 text-xs text-muted-foreground">Approaching your monthly limit.</p>
      ) : null}
    </div>
  );
}

/** Live usage-meter chip for a metered capability. Renders nothing for
 * non-metered keys or before the plan resolves. */
export function UsageMeter({ feature, className }: { feature: string; className?: string }) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { entitlement } = useEntitlement(workspaceSlug, feature);
  if (!entitlement || !entitlement.metered) return null;
  const label = ENTITLEMENT_CATALOG[feature]?.label ?? feature;
  return (
    <MeterBar
      label={label}
      used={entitlement.used}
      quota={entitlement.quota}
      className={className}
    />
  );
}
