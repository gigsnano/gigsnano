"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import {
  PLAN_TIERS,
  PLAN_TIER_ORDER,
  EBillingInterval,
  annualMonthlyEquivalentCents,
  ANNUAL_DISCOUNT_MONTHS,
} from "@/constants/plans";
import {
  useSubscription,
  useCreateCheckout,
  useCreatePortal,
} from "@/hooks/billing/use-subscription";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { useWorkspaceRole } from "@/hooks/workspace/use-workspace-role";
import { APIError } from "@/services/api-error";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { cn } from "@/lib/utils";

const INTERVALS: { id: EBillingInterval; label: string }[] = [
  { id: EBillingInterval.Monthly, label: "Monthly" },
  { id: EBillingInterval.Annual, label: "Annual" },
];

function priceLabel(monthlyCents: number | null, interval: EBillingInterval): string {
  if (monthlyCents === null) return "Custom";
  if (monthlyCents === 0) return "$0";
  const cents =
    interval === EBillingInterval.Annual
      ? annualMonthlyEquivalentCents(monthlyCents)
      : monthlyCents;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** Splits marketingBullets into Plane-style "Everything in X +" header + the new-feature checklist. */
function splitBullets(bullets: string[]): { header: string; items: string[] } {
  const [first, ...rest] = bullets;
  if (first?.toLowerCase().startsWith("everything in")) {
    return { header: `${first} +`, items: rest };
  }
  return { header: "Includes", items: bullets };
}

export function PlanComparison({ workspaceSlug }: { workspaceSlug: string }) {
  const { data } = useSubscription(workspaceSlug);
  const currentTier = data?.tier;
  const currentIdx = currentTier ? PLAN_TIER_ORDER.indexOf(currentTier) : -1;
  const currentDef = currentTier ? PLAN_TIERS[currentTier] : null;
  const isTopPlan = currentIdx === PLAN_TIER_ORDER.length - 1;
  const renews = data?.current_period_end
    ? new Date(data.current_period_end).toLocaleDateString()
    : null;

  const [interval, setBillingInterval] = useState<EBillingInterval>(EBillingInterval.Monthly);
  const activeIdx = interval === EBillingInterval.Monthly ? 0 : 1;
  const { barRef, pillRef } = useSlidingTabs(activeIdx);

  // Checkout, portal and top-up are all `require_role(ADMIN, OWNER)` on the
  // server. A plain member could read the plans but every button 403'd, which
  // surfaced as "Couldn't start that just now — please try again" — advice for
  // something that can never succeed. Members see the plans, not the controls.
  const { isAdmin } = useWorkspaceRole(workspaceSlug);
  const checkout = useCreateCheckout(workspaceSlug);
  const portal = useCreatePortal(workspaceSlug);
  const redirect = (r: { checkout_url: string }) => {
    window.location.href = r.checkout_url;
  };
  const err = checkout.error ?? portal.error;
  // 503 = backend reached but Stripe subscription prices aren't configured yet
  // (the "last mile"). Distinguish it from a transient failure.
  const notConfigured = err instanceof APIError && err.status === 503;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
      {/* Top row: current-plan badge + Manage billing · billing-interval toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {currentDef ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium text-primary">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              Current plan · {currentDef.name}
              {renews ? <span className="text-primary/70">· renews {renews}</span> : null}
            </span>
          ) : null}
          {currentDef && isAdmin ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={portal.isPending}
              onClick={() => portal.mutate(undefined, { onSuccess: redirect })}
            >
              {portal.isPending ? "Opening…" : "Manage billing"}
            </Button>
          ) : null}
        </div>

        <div
          ref={barRef}
          className="relative flex shrink-0 items-center rounded-lg border border-border/60 bg-muted/40 p-0.5"
        >
          <span
            ref={pillRef}
            className="t-issues-pill pointer-events-none absolute inset-y-0.5 left-0 rounded-md bg-background shadow-sm"
            aria-hidden
          />
          {INTERVALS.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              data-tab-index={i}
              aria-pressed={interval === opt.id}
              onClick={() => setBillingInterval(opt.id)}
              className={cn(
                "relative z-[1] rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 active:scale-[0.97]",
                interval === opt.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
              {opt.id === EBillingInterval.Annual ? (
                <span className="ml-1.5 text-xs text-primary">−{ANNUAL_DISCOUNT_MONTHS} mo</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Headline + subtitle */}
      <div className="mt-5 max-w-2xl">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {isTopPlan ? "You're on the Business plan" : "Upgrade to unlock more of GigsNano"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isTopPlan
            ? "You have everything GigsNano offers — advanced analytics, integrations, webhooks, SSO, and priority support."
            : "Advanced analytics, integrations, automations, custom work-item types, and coding-agent delegation — everything scales as your team grows."}
        </p>
      </div>

      {/* Tier columns */}
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLAN_TIER_ORDER.map((tierKey, i) => {
          const tier = PLAN_TIERS[tierKey];
          const isCurrent = tierKey === currentTier;
          const { header, items } = splitBullets(tier.marketingBullets);
          const relation = currentIdx < 0 ? 0 : i - currentIdx; // >0 upgrade, <0 downgrade
          const isPending = checkout.isPending && checkout.variables?.tier === tierKey;

          return (
            <ScrollReveal key={tier.tier} delay={i * 60} className="h-full">
              <div className="flex h-full flex-col">
                {/* Header box: name · price · CTA */}
                <div
                  className={cn(
                    "rounded-xl border p-5 transition-[border-color] duration-200",
                    isCurrent
                      ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/15"
                      : "border-border/60 [@media(hover:hover)]:hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-base font-semibold text-foreground">{tier.name}</h3>
                    {tier.highlighted && !isCurrent ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Popular
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-heading text-2xl font-bold tracking-tight text-foreground">
                      {priceLabel(tier.monthlyPriceCents, interval)}
                    </span>
                    {tier.monthlyPriceCents ? (
                      <span className="text-xs text-muted-foreground">per seat / month</span>
                    ) : null}
                  </p>

                  {!isAdmin ? null : isCurrent ? (
                    <Button variant="outline" size="sm" disabled className="mt-4 w-full">
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      variant={relation > 0 ? "default" : "outline"}
                      size="sm"
                      className="mt-4 w-full"
                      disabled={isPending}
                      onClick={() =>
                        checkout.mutate({ tier: tierKey, interval }, { onSuccess: redirect })
                      }
                    >
                      {isPending
                        ? "Redirecting…"
                        : relation > 0
                          ? `Upgrade to ${tier.name}`
                          : `Downgrade to ${tier.name}`}
                    </Button>
                  )}
                </div>

                {/* Feature checklist */}
                <div className="mt-5 px-1">
                  <p className="text-xs font-semibold text-foreground">{header}</p>
                  <ul className="mt-3 space-y-2.5">
                    {items.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          className="mt-0.5 size-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </ScrollReveal>
          );
        })}
      </div>

      {!isAdmin ? (
        <p className="mt-6 text-xs text-muted-foreground">
          Only a workspace admin or owner can change the plan or manage billing.
        </p>
      ) : null}

      {err ? (
        <p
          aria-live="polite"
          className={cn("mt-6 text-xs", notConfigured ? "text-muted-foreground" : "text-destructive")}
        >
          {notConfigured
            ? "Self-serve plan changes are coming soon — Stripe billing isn't fully set up yet."
            : "Couldn't start that just now — please try again."}
        </p>
      ) : null}
    </div>
  );
}
