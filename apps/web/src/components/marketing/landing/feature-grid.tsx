import { HugeiconsIcon } from "@hugeicons/react";

import { MARKETING_FEATURES } from "@/constants/marketing";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/**
 * The "everything a planner needs" grid, in the blueprint language: a calm 3-up
 * grid of fundamentals, each a neutral card with a tile icon that warms to the
 * accent on hover.
 */
export function FeatureGrid() {
  return (
    <section id="features" className="relative scroll-mt-24">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <ScrollReveal>
          <p className="lp-eyebrow lp-mono">The fundamentals</p>
          <h2 className="lp-h2 max-w-3xl">
            A complete <span className="lp-accent">workspace</span>, not just a planner
          </h2>
          <p className="lp-lede">
            The AI is what&apos;s different. The fundamentals your team relies on are all here too.
          </p>
        </ScrollReveal>

        <div className="lp-hr mt-12 mb-10" aria-hidden>
          <span className="lp-cross" data-pos="start" />
          <span className="lp-cross" data-pos="end" />
        </div>

        <div className="lp-featgrid">
          {MARKETING_FEATURES.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={(i % 3) * 70}>
              <div className="lp-card lp-feat h-full">
                <span className="lp-feat__icon">
                  <HugeiconsIcon icon={feature.icon} className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="lp-feat__title">{feature.title}</h3>
                  <p className="lp-feat__body">{feature.body}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
