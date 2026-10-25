/**
 * The calendar's visible date range — one definition for the grid and the query.
 *
 * The month grid always renders 42 cells starting on the Sunday on or before
 * the 1st, so it shows up to 6 trailing days of the previous month and up to 12
 * leading days of the next. The server query used to be scoped to the calendar
 * *month* instead, so every one of those out-of-month cells was structurally
 * empty — work with a due date on the 31st of the previous month simply never
 * arrived, and the only way to see it was to page back a month.
 *
 * Both the grid and `toStoryApiFilters` now derive from here, so the range that
 * is fetched is by construction the range that is drawn.
 */

/** 6 weeks × 7 days. Fixed so the grid's height never changes between months. */
export const CALENDAR_CELLS = 42;

/** `YYYY-MM` → the Date the grid's first cell represents (a Sunday). */
export function calendarGridStart(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year!, month! - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return start;
}

/** Local-time `YYYY-MM-DD`. Not `toISOString()`, which converts to UTC and can
 *  shift the day either side of midnight depending on the viewer's offset. */
export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Inclusive `YYYY-MM-DD` bounds covering every cell the grid draws. */
export function calendarGridRange(monthKey: string): { from: string; to: string } {
  const start = calendarGridStart(monthKey);
  const end = new Date(start);
  end.setDate(start.getDate() + CALENDAR_CELLS - 1);
  return { from: toDayKey(start), to: toDayKey(end) };
}
