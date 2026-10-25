import type { CSSProperties } from "react";

import { NumberTicker } from "@/components/ui/number-ticker";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

/**
 * Each stat's LED tile lights a 5×5 glyph that matches its content:
 *   agents  → a robot head       layouts → kanban columns
 *   cards   → a card outline      flows   → a forking path
 * "1" = lit cell.
 */
const STATS: {
  value: number;
  suffix?: string;
  label: string;
  color: string;
  pattern: string[];
}[] = [
  {
    value: 7,
    label: "BMAD agents",
    color: "#a78bfa",
    pattern: ["00100", "11111", "10101", "11111", "01010"],
  },
  {
    value: 5,
    label: "Work-item layouts",
    color: "#3b96ff",
    pattern: ["10101", "10101", "10101", "10101", "10101"],
  },
  {
    value: 10,
    label: "Sprint-0 cards",
    color: "#3ecf8e",
    pattern: ["11111", "10001", "10001", "10001", "11111"],
  },
  {
    value: 2,
    label: "Project flows",
    color: "#ffb224",
    pattern: ["00100", "00100", "01010", "10001", "10001"],
  },
];

/** 5×5 LED grid: lit glyph cells pulse in a diagonal wave (delay = row+col). */
function PixelGlyph({ pattern }: { pattern: string[] }) {
  return (
    <span className="lp-pix" aria-hidden>
      {pattern.flatMap((row, r) =>
        row.split("").map((cell, c) => {
          const on = cell === "1";
          return (
            <span
              key={`${r}-${c}`}
              className={on ? "on" : undefined}
              style={on ? ({ "--lp-d": `${(r + c) * 90}ms` } as CSSProperties) : undefined}
            />
          );
        }),
      )}
    </span>
  );
}

/**
 * Stat band in the blueprint language — designownow-style stat cards, each with
 * a dark dot-matrix tile animating a content-specific 5×5 glyph in the card's
 * accent, an accent bar, a count-up number (Magic UI NumberTicker), and a mono
 * label.
 */
export function StatsBand() {
  return (
    <section className="relative">
      <div className="lp-frame lp-frame--tight">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <ScrollReveal key={stat.label} delay={(i % 4) * 70}>
              <article
                className="lp-card lp-statcard h-full"
                style={{ "--lp-local": stat.color } as CSSProperties}
              >
                <div className="lp-statcard__head">
                  <PixelGlyph pattern={stat.pattern} />
                  <span className="lp-statcard__bar" aria-hidden />
                  <span className="lp-statcard__num">
                    <NumberTicker value={stat.value} />
                    {stat.suffix}
                  </span>
                </div>
                <p className="lp-statcard__label lp-mono">{stat.label}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
