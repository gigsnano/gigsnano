/**
 * Tabs for the redesigned work-item detail page (GIN-479).
 *
 * The GIN-477 ticket specified `Overview · Execute · Delivery · Activity`.
 * Execute was renamed to **Runs** and its executor-selection half moved onto
 * Overview: choosing an executor is not a tab's worth of work, watching an
 * agent work is. `?tab=execute` therefore still resolves — it aliases to
 * `runs` — so links filed against the original spec keep working.
 */
export const WORK_ITEM_TABS = [
  { id: "overview", label: "Overview" },
  { id: "runs", label: "Runs" },
  { id: "delivery", label: "Delivery" },
  { id: "activity", label: "Activity" },
] as const;

export type WorkItemTab = (typeof WORK_ITEM_TABS)[number]["id"];

export const DEFAULT_WORK_ITEM_TAB: WorkItemTab = "overview";

const TAB_IDS = new Set<string>(WORK_ITEM_TABS.map((t) => t.id));

/** Retired tab names that still resolve, so old deep links don't 404 the reader. */
const ALIASES: Record<string, WorkItemTab> = { execute: "runs" };

/** The tab a `?tab=` value selects. Unknown or absent → Overview. */
export function parseWorkItemTab(raw: string | null | undefined): WorkItemTab {
  if (!raw) return DEFAULT_WORK_ITEM_TAB;
  const value = raw.toLowerCase();
  if (TAB_IDS.has(value)) return value as WorkItemTab;
  return ALIASES[value] ?? DEFAULT_WORK_ITEM_TAB;
}

/**
 * The canonical `?tab=` value to rewrite the URL to, or `null` when it already
 * is canonical. Only an alias earns a redirect — an unknown value is left alone
 * so a typo doesn't rewrite the reader's address bar mid-visit.
 */
export function canonicalTabParam(raw: string | null | undefined): WorkItemTab | null {
  if (!raw) return null;
  const alias = ALIASES[raw.toLowerCase()];
  return alias ?? null;
}
