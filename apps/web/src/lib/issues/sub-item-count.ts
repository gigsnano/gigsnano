/** The compact count shown beside a parent's expand chevron. */
export interface ISubItemCount {
  /** What the row displays: "3", or "3/7" when the filter hides some. */
  label: string;
  /** Long form for the aria-label: "3" or "3 of 7". */
  spoken: string;
  /** True when the current filter is hiding children — drives the accent colour. */
  hidden: boolean;
}

/**
 * Display cap for the visible label — never the spoken one.
 *
 * The row's slot is a fixed `w-12` (48px) holding a 14px chevron plus a 2px
 * gap, leaving **32px** for the label at `text-[11px]`. A cap of 99 permitted
 * `"99+/99+"`: seven glyphs at ~0.5-0.6em each is 38-45px, which overflowed and
 * had to be clipped, so a big number rendered as a truncated one. Nine caps the
 * worst case at `"9+/9+"` — five glyphs, ~28px — which fits without clipping.
 *
 * ponytail: a wider slot would allow a bigger cap, but the slot width is what
 * keeps every row's priority/status/title columns aligned, so the number gives
 * way rather than the layout.
 */
const DISPLAY_CAP = 9;
const capped = (n: number) => (n > DISPLAY_CAP ? `${DISPLAY_CAP}+` : String(n));

export function subItemCount(matchCount: number, totalCount: number): ISubItemCount {
  // ponytail: sub_issue_count can be stale-low (server counter behind the
  // real children) — clamp rather than ever render an impossible "3/1".
  const total = Math.max(totalCount, matchCount);
  const hidden = total > matchCount;
  return {
    // Capped so the on-row label ("99+/99+" worst case) always fits its fixed
    // slot — a screen reader still gets the real numbers via `spoken` below.
    label: hidden ? `${capped(matchCount)}/${capped(total)}` : capped(matchCount),
    spoken: hidden ? `${matchCount} of ${total}` : String(matchCount),
    hidden,
  };
}
