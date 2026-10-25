import type { CSSProperties } from "react";

import { MARKETING_AGENTS } from "@/constants/marketing";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/**
 * The BMAD roster in the hero's blueprint language: seven agent spec-modules
 * on the shared dashed sheet, each a 3D slab with a colored agent tile, its
 * role, and the Sprint-0 artifact it owns. Accent-lit on hover; staggered
 * scroll reveal. Replaces the earlier orbiting-constellation treatment.
 */
export function AgentPipeline() {
  return (
    <section className="relative">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <ScrollReveal>
          <p className="lp-eyebrow lp-mono">02 — The roster</p>
          <h2 className="lp-h2 max-w-3xl">
            One method, <span className="lp-outline">seven</span>{" "}
            <span className="lp-accent">specialists</span>
          </h2>
          <p className="lp-lede">
            A role-specific agent owns each step of the method and hands off cleanly to the next —
            from the first brief to a ready sprint plan.
          </p>
        </ScrollReveal>

        <div className="lp-hr mt-12 mb-10" aria-hidden>
          <span className="lp-cross" data-pos="start" />
          <span className="lp-cross" data-pos="end" />
        </div>

        <div className="lp-roster">
          {MARKETING_AGENTS.map((agent, i) => (
            <ScrollReveal key={agent.role} delay={(i % 4) * 70}>
              <article
                className="lp-card lp-agentcard"
                style={{ "--lp-local": agent.color } as CSSProperties}
              >
                <div className="lp-agentcard__top">
                  <span className="lp-agentcard__tile lp-mono">{agent.initials}</span>
                  <span className="lp-agentcard__idx lp-mono">
                    A·{String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="lp-agentcard__role">{agent.role}</h3>
                <p className="lp-agentcard__owns lp-mono">
                  Owns · <b>{agent.owns}</b>
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
