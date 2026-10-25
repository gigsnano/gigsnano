"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";

import { ENTITLEMENT_CATALOG } from "@/constants/entitlements-catalog";
import { PLAN_TIERS } from "@/constants/plans";
import { useEntitlementSummary } from "@/hooks/billing/use-entitlement-summary";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { IEntitlement } from "@/types";

import { MeterBar } from "./usage-meter";

export function EntitlementsOverview({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useEntitlementSummary(workspaceSlug);

  const byKey = new Map<string, IEntitlement>((data ?? []).map((e) => [e.key, e]));

  return (
    <section className="max-w-5xl px-10 py-8">
      <h2 className="text-lg font-semibold">Plan & usage</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        What your plan includes and how much you&apos;ve used this month.
      </p>

      <div className="mt-5">
        {isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            align="start"
            title="Couldn't load entitlements"
            description="Something went wrong fetching your plan capabilities."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border">
            {Object.entries(ENTITLEMENT_CATALOG).map(([key, def]) => {
              const ent = byKey.get(key);
              const available = ent?.available ?? true;
              return (
                <li key={key} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{def.label}</p>
                    <p className="truncate text-sm text-muted-foreground">{def.description}</p>
                  </div>
                  {ent?.metered && available ? (
                    <MeterBar label="Used" used={ent.used} quota={ent.quota} className="shrink-0" />
                  ) : available ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
                      Included
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                      <HugeiconsIcon icon={SquareLock02Icon} className="size-4" />
                      Needs {PLAN_TIERS[def.minTier].name}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
