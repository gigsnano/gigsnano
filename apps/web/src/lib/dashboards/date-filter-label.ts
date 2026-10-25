import { DATE_RANGE_LABELS } from "@/constants/dashboard-date-ranges";
import { EWidgetDateRange, type IDashboardFilters } from "@/types";

export type TDateFilter = Pick<IDashboardFilters, "date_range" | "date_from" | "date_to">;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
/** YYYY-MM-DD read as a local calendar day (not UTC midnight, which shifts it). */
const formatDay = (iso: string) => DAY_FORMAT.format(new Date(`${iso}T00:00:00`));

/** "Last 30 days", "May 1 – Jun 3", "Since May 1" — a date filter in words. */
export function dateFilterLabel({ date_range: range, date_from: from, date_to: to }: TDateFilter): string {
  if (range !== EWidgetDateRange.Custom) return DATE_RANGE_LABELS[range ?? EWidgetDateRange.All];
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `Since ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return DATE_RANGE_LABELS[EWidgetDateRange.Custom];
}
