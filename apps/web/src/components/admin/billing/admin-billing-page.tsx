"use client";

import { useState } from "react";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSetWorkspacePlan, useStaffMe } from "@/hooks/admin/use-admin";
import { PLAN_TIERS, PLAN_TIER_ORDER, EBillingInterval } from "@/constants/plans";
import { APIError } from "@/services/api-error";
import { EPrivilege } from "@/types";

import { PlanPricesGrid } from "./plan-prices-grid";

const INTERVALS: { value: EBillingInterval; label: string }[] = [
  { value: EBillingInterval.Monthly, label: "Monthly" },
  { value: EBillingInterval.Annual, label: "Annual" },
];

export function AdminBillingPage() {
  const { data: me } = useStaffMe();
  const canManage = new Set(me?.privileges ?? []).has(EPrivilege.BillingManage);

  if (me && !canManage) {
    return (
      <>
        <AdminHeader title="Plans & Billing" />
        <div className="flex-1 overflow-y-auto p-6">
          <EmptyState
            assetKey="generic"
            title="No access"
            description="You need the Billing privilege to manage plans."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title="Plans & Billing" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex max-w-2xl flex-col gap-6">
          <PlanPricesGrid />
          <SetWorkspacePlanPanel />
        </div>
      </div>
    </>
  );
}

function SetWorkspacePlanPanel() {
  const setPlan = useSetWorkspacePlan();
  const [slug, setSlug] = useState("");
  const [tier, setTier] = useState<string>(PLAN_TIER_ORDER[1]); // default Pro
  const [interval, setBillingInterval] = useState<EBillingInterval>(EBillingInterval.Monthly);

  const result = setPlan.data;
  const errorMsg =
    setPlan.error instanceof APIError
      ? setPlan.error.status === 404
        ? "No workspace with that slug."
        : "Couldn't set the plan — please try again."
      : setPlan.error
        ? "Couldn't set the plan — please try again."
        : null;

  const onApply = (e: React.FormEvent) => {
    e.preventDefault();
    const s = slug.trim();
    if (!s) return;
    setPlan.mutate({ slug: s, payload: { tier, interval } });
  };

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Set a workspace&apos;s plan</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Manually grant a workspace a plan (no payment). Set the tier to Free to remove a
        paid plan.
      </p>

      <form onSubmit={onApply} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-slug">Workspace slug</Label>
          <input
            id="ws-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. acme"
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-tier">Tier</Label>
            <select
              id="ws-tier"
              aria-label="Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {PLAN_TIER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {PLAN_TIERS[t].name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-interval">Interval</Label>
            <select
              id="ws-interval"
              aria-label="Interval"
              value={interval}
              onChange={(e) => setBillingInterval(e.target.value as EBillingInterval)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={setPlan.isPending || !slug.trim()}>
            {setPlan.isPending ? "Applying…" : "Apply plan"}
          </Button>
          {result ? (
            <span className="text-sm text-muted-foreground">
              Set <span className="font-medium text-foreground">{result.workspace_slug}</span> to{" "}
              <span className="font-medium text-foreground">
                {PLAN_TIERS[result.tier as keyof typeof PLAN_TIERS]?.name ?? result.tier}
              </span>
              .
            </span>
          ) : errorMsg ? (
            <span className="text-sm text-destructive">{errorMsg}</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
