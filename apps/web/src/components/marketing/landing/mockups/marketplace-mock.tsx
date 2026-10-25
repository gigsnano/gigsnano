import { HugeiconsIcon } from "@hugeicons/react";
import {
  StarIcon,
  Location01Icon,
  BookmarkIcon,
  CheckmarkBadge01Icon,
} from "@hugeicons/core-free-icons";

const TAGS = ["Python", "FastAPI", "openpyxl", "Pandas"];

/**
 * Minimalist recreation of the real marketplace job card (`marketplace/jobs/
 * job-card.tsx`): posted/proposals meta + save, title, rate/experience line,
 * client trust line (payment verified · rating · spend · location), a clamped
 * description, and skill tags. Landing tokens throughout.
 */
export function MarketplaceMock() {
  return (
    <div className="lp-window">
      <div className="lp-window__bar">
        <span className="lp-window__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="lp-window__title lp-mono">Find work</span>
      </div>

      <div className="lp-window__body">
        <article>
          <div className="flex items-center justify-between">
            <p className="lp-mono text-[var(--lp-ink-faint)]">Posted 2 days ago · Proposals: 5 to 10</p>
            <HugeiconsIcon
              icon={BookmarkIcon}
              className="size-4 text-[var(--lp-ink-faint)]"
              aria-hidden
            />
          </div>

          <p className="mt-1.5 text-[0.98rem] font-semibold text-[var(--lp-ink)]">
            Build the exports XLSX writer
          </p>
          <p className="mt-1 text-[0.78rem] text-[var(--lp-ink-dim)]">
            Fixed price: $480 · Expert · Est. less than 1 month
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.74rem] text-[var(--lp-ink-dim)]">
            <span className="inline-flex items-center gap-1" style={{ color: "var(--lp-accent-bright)" }}>
              <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5" aria-hidden />
              Payment verified
            </span>
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon icon={StarIcon} className="size-3" style={{ color: "#ffb224" }} aria-hidden />
              <span className="font-medium text-[var(--lp-ink)]">5.0</span>
            </span>
            <span>$2K+ spent</span>
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon icon={Location01Icon} className="size-3" aria-hidden />
              United States
            </span>
          </div>

          <p className="mt-2.5 text-[0.8rem] leading-relaxed text-[var(--lp-ink-dim)]">
            Need a robust XLSX writer for our reporting module — styled sheets, formulas, and
            streaming for large datasets.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {TAGS.map((tag) => (
              <span key={tag} className="lp-mk-tag">
                {tag}
              </span>
            ))}
            <span className="lp-mk-tag text-[var(--lp-ink-faint)]">+3</span>
          </div>
        </article>

        {/* a second, compact listing to imply the feed */}
        <div className="mt-4 border-t border-[var(--lp-line)] pt-3.5">
          <div className="flex items-center justify-between">
            <p className="lp-mono text-[var(--lp-ink-faint)]">Posted 5 hours ago</p>
            <HugeiconsIcon
              icon={BookmarkIcon}
              className="size-4 text-[var(--lp-ink-faint)]"
              aria-hidden
            />
          </div>
          <p className="mt-1 text-[0.9rem] font-semibold text-[var(--lp-ink)]">
            React dashboard polish pass
          </p>
          <p className="mt-1 text-[0.76rem] text-[var(--lp-ink-dim)]">
            Hourly: $40–$70 · Intermediate
          </p>
        </div>
      </div>
    </div>
  );
}
