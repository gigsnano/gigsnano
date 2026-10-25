/**
 * Fixed page canvas behind the whole marketing page. Consistent with the hero:
 * a single flat `--lp-bg` fill (the blueprint sheet color) — no aurora washes,
 * no dot grid. The `--lp-bg` token is theme-aware (light/dark) via `.lp-surface`
 * on the layout root, so this flips with the theme. Fixed + pointer-events-none,
 * so it never repaints on scroll and never intercepts clicks.
 */
export function MarketingBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-[var(--lp-bg)]"
    />
  );
}
