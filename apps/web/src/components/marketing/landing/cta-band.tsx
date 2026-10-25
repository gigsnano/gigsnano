import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/**
 * Closing CTA as a bold blueprint panel — faint grid, soft accent bloom, a
 * display headline, and the hero's keycap + ghost CTAs, closing the loop with
 * the top of the page.
 */
export function CtaBand() {
  return (
    <section className="relative">
      <div className="lp-frame">
        <ScrollReveal>
          <div className="lp-cta">
            <div className="lp-cta__inner">
              <h2 className="lp-h2 mx-auto max-w-2xl">
                Run your first <span className="lp-accent">Sprint-0</span> today
              </h2>
              <p className="lp-lede mx-auto text-center">
                Create a project and let the BMAD agents plan it with you — free to start, no card
                required.
              </p>

              <div className="lp-cta__actions">
                <Link href="/sign-up" className="lp-key">
                  <span className="lp-key__cap">
                    <span className="lp-key__dots" aria-hidden />
                    <span className="lp-key__label">Start free</span>
                    <span className="lp-key__leds" aria-hidden />
                  </span>
                </Link>
                <Link href="/sign-in" className="lp-ghost">
                  Sign in
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="lp-ghost__arrow size-4"
                    aria-hidden
                  />
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
