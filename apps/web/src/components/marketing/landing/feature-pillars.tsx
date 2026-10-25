import type { CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiBrain01Icon, BubbleChatIcon } from "@hugeicons/core-free-icons";

import { MARKETING_PILLARS } from "@/constants/marketing";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/** Per-pillar accent, echoing the hero's agent palette. */
const ACCENT = ["oklch(0.671 0.177 254.495)", "oklch(0.709 0.159 293.541)", "oklch(0.762 0.154 159.355)"] as const;

/**
 * The code-built 3D scene that fills the bottom of each pillar card (all
 * `aria-hidden` — decorative). Each maps its pillar to a concrete GigsNano
 * moment, in the designownow bento style, using the shared `--lp-*` slabs.
 */
function PillarScene({ index }: { index: number }) {
  // 02 · An agent on every card — an AI agent chip streaming a reply.
  if (index === 1) {
    return (
      <>
        <span className="lp-agent">
          <span className="lp-agent__screen">
            <HugeiconsIcon icon={AiBrain01Icon} className="lp-agent__glyph size-6" aria-hidden />
          </span>
          <span className="lp-agent__pip" />
        </span>

        <span className="lp-bubble lp-bubble--msg">
          <span className="lp-bar" style={{ width: "5.4rem" }} />
          <span className="lp-bar" style={{ width: "3.6rem" }} />
        </span>

        <span className="lp-bubble lp-bubble--reply">
          <span className="lp-mono lp-bubble__name">Architect</span>
          <span className="lp-bubble__dots">
            <span className="gn-typing-dot" />
            <span className="gn-typing-dot" style={{ animationDelay: "150ms" }} />
            <span className="gn-typing-dot" style={{ animationDelay: "300ms" }} />
          </span>
        </span>
      </>
    );
  }

  // 03 · Docs you can review — a generated doc with a selected block + comment.
  if (index === 2) {
    return (
      <>
        <span className="lp-doc">
          <span className="lp-doc__head">
            <b />
            <i />
          </span>
          <span className="lp-doc__line" style={{ width: "100%" }} />
          <span className="lp-doc__line" style={{ width: "84%" }} />
          <span className="lp-doc__line--hl" style={{ width: "72%" }} />
          <span className="lp-doc__line" style={{ width: "92%" }} />
          <span className="lp-doc__line" style={{ width: "58%" }} />
        </span>

        <span className="lp-comment">
          <span className="lp-comment__avatar">AR</span>
          <span className="lp-comment__body">
            <span className="lp-mono lp-comment__name">Architect</span>
            <span className="lp-bar" style={{ width: "3.2rem" }} />
          </span>
        </span>
      </>
    );
  }

  // 01 · Sprint-0, out of the box — the seeded planning-card stack.
  return (
    <>
      <span className="lp-mini lp-mini--back">
        <span className="lp-mini__id lp-mono">GIN-06</span>
        <span className="lp-mini__title">Extract epics &amp; stories</span>
      </span>

      <span className="lp-mini lp-mini--mid">
        <span className="lp-mini__id lp-mono">GIN-04</span>
        <span className="lp-mini__title">Create the PRD</span>
        <span className="lp-mini__row">
          <span className="lp-mini__dot" style={{ background: "oklch(0.817 0.164 75.837)" }} />
          <span className="lp-mini__chip lp-mono">PM</span>
        </span>
      </span>

      <span className="lp-mini lp-mini--front">
        <span className="lp-mini__id lp-mono">GIN-03</span>
        <span className="lp-mini__title">Write Product Brief</span>
        <span className="lp-mini__row">
          <span className="lp-mini__dot" style={{ background: "oklch(0.701 0.2 6.638)" }} />
          <span className="lp-mono lp-mini__agent" style={{ color: "oklch(0.701 0.2 6.638)" }}>
            Analyst
          </span>
          <span className="lp-mini__chip lp-mono">
            <HugeiconsIcon icon={BubbleChatIcon} className="size-2.5" aria-hidden />2
          </span>
        </span>
      </span>
    </>
  );
}

/**
 * "Why GigsNano" pillars in the hero's blueprint language: the same 74rem
 * dashed sheet + crosshairs, mono section index, mixed solid/outline display
 * heading, and 3D card slabs. Each card is a designownow-style bento — title +
 * body on top, a code-built theme-aware illustration filling the bottom.
 */
export function FeaturePillars() {
  return (
    <section className="relative">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <ScrollReveal>
          <p className="lp-eyebrow lp-mono">01 — Why GigsNano</p>
          <h2 className="lp-h2 max-w-3xl">
            Not another <span className="lp-outline">empty</span>{" "}
            <span className="lp-accent">backlog</span>
          </h2>
          <p className="lp-lede">
            Every project opens with an opinionated Sprint-0 and an AI specialist on every card — so
            you start from a plan, not a blank page.
          </p>
        </ScrollReveal>

        <div className="lp-hr mt-12 mb-10" aria-hidden>
          <span className="lp-cross" data-pos="start" />
          <span className="lp-cross" data-pos="end" />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {MARKETING_PILLARS.map((pillar, i) => (
            <ScrollReveal key={pillar.title} delay={i * 90}>
              <article
                className="lp-card lp-pillar lp-pillar--scene h-full"
                style={{ "--lp-local": ACCENT[i] } as CSSProperties}
              >
                <span className="lp-pillar__tag lp-mono">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="lp-pillar__title">{pillar.title}</h3>
                <p className="lp-pillar__body">{pillar.body}</p>

                <div className="lp-pillar__illus" aria-hidden>
                  <PillarScene index={i} />
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
