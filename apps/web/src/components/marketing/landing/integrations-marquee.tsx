import type { CSSProperties } from "react";

import { MARKETING_TOOLS } from "@/constants/marketing";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/** Port colors cycled across the connector chips. */
const PORT = ["#3b96ff", "#a78bfa", "#3ecf8e", "#ffb224", "#ff5c8a", "#22d3ee", "#f472b6"];

function Chip({ tool, i }: { tool: string; i: number }) {
  return (
    <span className="lp-eco__chip">
      <span
        className="lp-eco__port"
        style={{ "--lp-local": PORT[i % PORT.length] } as CSSProperties}
      />
      {tool}
    </span>
  );
}

/**
 * Ecosystem "signal bus": two counter-scrolling rows of blueprint connector
 * chips — each with a glowing port — flanking an animated bus line, so the
 * whole stack visibly plugs into one line. Pauses on hover; reduced-motion
 * collapses to a single static, centered row.
 */
export function IntegrationsMarquee() {
  const rowA = MARKETING_TOOLS;
  const rowB = [...MARKETING_TOOLS].reverse();

  return (
    <section className="relative">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <ScrollReveal>
          <p className="lp-eyebrow lp-mono">Ecosystem</p>
          <h2 className="lp-h2 max-w-3xl">
            Plugs into <span className="lp-accent">your stack</span>
          </h2>
          <p className="lp-lede">
            GigsNano connects to the tools your team already runs — from repos and CI to chat, LLMs,
            and payments.
          </p>
        </ScrollReveal>

        <div className="lp-eco__stage">
          <div className="lp-eco__row lp-eco__row--a">
            <div className="lp-eco__seq">
              {rowA.map((tool, i) => (
                <Chip key={tool} tool={tool} i={i} />
              ))}
            </div>
            <div className="lp-eco__seq" aria-hidden>
              {rowA.map((tool, i) => (
                <Chip key={tool} tool={tool} i={i} />
              ))}
            </div>
          </div>

          <span className="lp-eco__bus" aria-hidden />

          <div className="lp-eco__row lp-eco__row--b" aria-hidden>
            <div className="lp-eco__seq">
              {rowB.map((tool, i) => (
                <Chip key={tool} tool={tool} i={i} />
              ))}
            </div>
            <div className="lp-eco__seq">
              {rowB.map((tool, i) => (
                <Chip key={tool} tool={tool} i={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
