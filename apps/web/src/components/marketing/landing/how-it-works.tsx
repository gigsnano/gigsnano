import { MARKETING_STEPS } from "@/constants/marketing";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/**
 * "How Sprint-0 works" as a blueprint step timeline: four neutral numbered
 * nodes on a dashed connector rail with an accent flow comet sweeping along it,
 * showing the ordered BMAD progression. Same 74rem sheet as every section.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <ScrollReveal>
          <p className="lp-eyebrow lp-mono">03 — How it works</p>
          <h2 className="lp-h2 max-w-3xl">
            From <span className="lp-outline">idea</span> to a{" "}
            <span className="lp-accent">shipped backlog</span>
          </h2>
          <p className="lp-lede">
            Cards unlock in the order the method requires — so the plan builds on itself instead of
            skipping ahead.
          </p>
        </ScrollReveal>

        <div className="lp-hr mt-12 mb-14" aria-hidden>
          <span className="lp-cross" data-pos="start" />
          <span className="lp-cross" data-pos="end" />
        </div>

        <div className="lp-steps">
          <span className="lp-steps__rail" aria-hidden />
          {MARKETING_STEPS.map((step, i) => (
            <ScrollReveal key={step.title} delay={(i % 4) * 80}>
              <div className="lp-step">
                <span className="lp-step__node lp-mono">{String(i + 1).padStart(2, "0")}</span>
                <span className="lp-step__label lp-mono">{step.label}</span>
                <h3 className="lp-step__title">{step.title}</h3>
                <p className="lp-step__body">{step.body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
