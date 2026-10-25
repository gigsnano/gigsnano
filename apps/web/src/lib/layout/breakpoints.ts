/**
 * Tailwind v4 default breakpoints, for the few places JS has to agree with the
 * CSS (closing a phone sheet when the viewport grows, phone-only behaviour in a
 * store action). `md` is the phone ⇄ desktop cutover across every shell.
 */
export const BREAKPOINTS = { sm: 40, md: 48, lg: 64, xl: 80 } as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** Media query matching viewports at or above `bp` — Tailwind's `md:`. */
export const minWidth = (bp: Breakpoint) => `(width >= ${BREAKPOINTS[bp]}rem)`;

/** Media query matching viewports below `bp` — Tailwind's `max-md:`. */
export const maxWidth = (bp: Breakpoint) => `(width < ${BREAKPOINTS[bp]}rem)`;

/** Current viewport is below `bp`. False on the server. */
export const isBelow = (bp: Breakpoint) =>
  typeof window !== "undefined" && window.matchMedia(maxWidth(bp)).matches;
