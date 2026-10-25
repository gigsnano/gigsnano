"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import {
  PLAN_TIERS,
  PLAN_TIER_ORDER,
  EBillingInterval,
  annualMonthlyEquivalentCents,
  ANNUAL_DISCOUNT_MONTHS,
} from "@/constants/plans";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { cn } from "@/lib/utils";

function priceLabel(monthlyCents: number | null, interval: EBillingInterval): string {
  if (monthlyCents === null) return "Custom";
  if (monthlyCents === 0) return "$0";
  const cents =
    interval === EBillingInterval.Annual ? annualMonthlyEquivalentCents(monthlyCents) : monthlyCents;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * Per-seat pricing in the blueprint language: a themed billing toggle (sliding
 * pill) and three tier slabs, the popular one carrying a restrained accent ring
 * + filled CTA. Pricing logic (interval, annual equivalent) is unchanged.
 */
export function Pricing() {
  const [interval, setBillingInterval] = useState<EBillingInterval>(EBillingInterval.Monthly);
  const idx = interval === EBillingInterval.Annual ? 1 : 0;

  return (
    <section id="pricing" className="relative scroll-mt-24">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <ScrollReveal>
          <p className="lp-eyebrow lp-mono">Pricing</p>
          <h2 className="lp-h2 max-w-3xl">
            Simple, <span className="lp-accent">per-seat</span> pricing
          </h2>
          <p className="lp-lede">
            Start free with the full Sprint-0 agent loop. Upgrade as your team grows.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <div className="lp-toggle" style={{ "--i": idx } as CSSProperties}>
              <span className="lp-toggle__pill" aria-hidden />
              <button
                type="button"
                onClick={() => setBillingInterval(EBillingInterval.Monthly)}
                className={cn("lp-toggle__btn", idx === 0 && "lp-toggle__btn--on")}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval(EBillingInterval.Annual)}
                className={cn("lp-toggle__btn", idx === 1 && "lp-toggle__btn--on")}
              >
                Annual
              </button>
            </div>
            <span className="lp-mono text-[var(--lp-ink-faint)]">
              Save {ANNUAL_DISCOUNT_MONTHS} months
            </span>
          </div>
        </ScrollReveal>

        <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
          {PLAN_TIER_ORDER.map((tierKey, i) => {
            const tier = PLAN_TIERS[tierKey];
            return (
              <ScrollReveal key={tier.tier} delay={i * 90}>
                <div className={cn("lp-card lp-price h-full", tier.highlighted && "lp-price--top")}>
                  <div className="lp-price__head">
                    <span className="lp-price__name">{tier.name}</span>
                    {tier.highlighted ? (
                      <span className="lp-price__badge lp-mono">Popular</span>
                    ) : null}
                  </div>
                  <p className="lp-price__tag">{tier.tagline}</p>

                  <p className="lp-price__amount">
                    <span className="lp-price__num">
                      {priceLabel(tier.monthlyPriceCents, interval)}
                    </span>
                    {tier.monthlyPriceCents ? (
                      <span className="lp-price__per">/ seat / mo</span>
                    ) : null}
                  </p>

                  <Link
                    href="/sign-up"
                    className={cn(
                      "lp-price__cta",
                      tier.highlighted ? "lp-price__cta--primary" : "lp-price__cta--outline",
                    )}
                  >
                    {tier.monthlyPriceCents === 0 ? "Start free" : "Start free trial"}
                  </Link>

                  <ul className="lp-price__list">
                    {tier.marketingBullets.map((feature) => (
                      <li key={feature} className="lp-price__item">
                        <span className="lp-showcase__check">
                          <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
