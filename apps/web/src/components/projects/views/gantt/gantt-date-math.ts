// src/components/projects/views/gantt/gantt-date-math.ts

const MS_PER_DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** A schedulable item — structurally satisfied by IProject / dated stories. */
interface IScheduled {
  start_date: string;
  target_date: string;
}

/** Story-like dates — either side may be missing (Plane partial blocks). */
export interface ITimelineDates {
  start_date: string | null;
  target_date: string | null;
}

export interface IDayColumn {
  date: Date;
  isWeekend: boolean;
  isToday: boolean;
}

export interface IWeekColumn {
  start: Date;
  end: Date;
  label: string;
  isCurrent: boolean;
}

export interface IMonthGroup {
  label: string;
  /** Number of columns (days in Week zoom, weeks in Month/Quarter zoom) this month spans. */
  span: number;
}

/** Parse a date-only (or full ISO) string to a UTC-midnight Date. */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_PER_DAY);
}

/** Whole days from a → b (b - a). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** UTC midnight of "today". */
function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function monthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dowLabel(d: Date): string {
  return DOW[d.getUTCDay()];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/** Snap back to Monday of the date's week (UTC; Monday = start of week). */
function snapToMonday(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  return addDays(d, -dow);
}

/** Snap forward to Sunday of the date's week (UTC). */
function snapToSunday(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(d, 6 - dow);
}

/**
 * The chart's Monday-snapped start and total (multiple-of-7) day count.
 * Plane-style: center on today with padding, then expand to cover any item dates.
 */
export function getChartRange(
  items: ITimelineDates[],
  paddingDays: number,
): { chartStart: Date; totalDays: number } {
  const today = todayUTC();
  let minT = addDays(today, -paddingDays).getTime();
  let maxT = addDays(today, paddingDays).getTime();

  for (const item of items) {
    if (item.start_date) {
      const t = parseDate(item.start_date).getTime();
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    if (item.target_date) {
      const t = parseDate(item.target_date).getTime();
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
  }

  const chartStart = snapToMonday(new Date(minT));
  const chartEnd = snapToSunday(new Date(maxT));
  return { chartStart, totalDays: daysBetween(chartStart, chartEnd) + 1 };
}

export function buildDayColumns(chartStart: Date, totalDays: number): IDayColumn[] {
  const today = todayUTC();
  const cols: IDayColumn[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(chartStart, i);
    const dow = date.getUTCDay();
    cols.push({ date, isWeekend: dow === 0 || dow === 6, isToday: isSameDay(date, today) });
  }
  return cols;
}

export function buildWeekColumns(chartStart: Date, totalDays: number): IWeekColumn[] {
  const today = todayUTC().getTime();
  const cols: IWeekColumn[] = [];
  const weeks = Math.ceil(totalDays / 7);
  for (let i = 0; i < weeks; i++) {
    const start = addDays(chartStart, i * 7);
    const end = addDays(start, 6);
    cols.push({
      start,
      end,
      label: String(start.getUTCDate()),
      isCurrent: today >= start.getTime() && today <= end.getTime(),
    });
  }
  return cols;
}

export function groupDaysByMonth(cols: IDayColumn[]): IMonthGroup[] {
  const groups: IMonthGroup[] = [];
  for (const c of cols) {
    const label = monthLabel(c.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.span += 1;
    else groups.push({ label, span: 1 });
  }
  return groups;
}

export function groupWeeksByMonth(cols: IWeekColumn[]): IMonthGroup[] {
  const groups: IMonthGroup[] = [];
  for (const c of cols) {
    const label = monthLabel(c.start);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.span += 1;
    else groups.push({ label, span: 1 });
  }
  return groups;
}

export function getBarPosition(
  project: IScheduled,
  chartStart: Date,
  dayWidth: number,
): { left: number; width: number } {
  const start = parseDate(project.start_date);
  const target = parseDate(project.target_date);
  const left = daysBetween(chartStart, start) * dayWidth;
  const days = Math.max(daysBetween(start, target) + 1, 1);
  return { left, width: days * dayWidth };
}

/**
 * Plane-style block geometry:
 * - both dates → full span
 * - start only → left at start, width = DEFAULT_BLOCK_WIDTH (60px)
 * - target only → right edge on due day, width = 60px
 */
export function getTimelineBarPosition(
  item: ITimelineDates,
  chartStart: Date,
  dayWidth: number,
  defaultBlockWidth = 60,
): { left: number; width: number } | null {
  if (!item.start_date && !item.target_date) return null;

  if (item.start_date && item.target_date) {
    return getBarPosition(
      { start_date: item.start_date, target_date: item.target_date },
      chartStart,
      dayWidth,
    );
  }

  if (item.start_date) {
    const start = parseDate(item.start_date);
    return {
      left: daysBetween(chartStart, start) * dayWidth,
      width: defaultBlockWidth,
    };
  }

  // target only — right edge ends on the due day (Plane getItemPositionWidth)
  const target = parseDate(item.target_date!);
  const targetLeft = daysBetween(chartStart, target) * dayWidth;
  return {
    left: targetLeft - defaultBlockWidth + dayWidth,
    width: defaultBlockWidth,
  };
}

/**
 * Map bar pixels back to dates after drag (Plane getUpdatedPositionAfterDrag).
 * `completeHalfBlock` writes both sides when the user dragged the missing edge.
 */
export function getDatesFromBarPixels(
  leftPx: number,
  widthPx: number,
  chartStart: Date,
  dayWidth: number,
): { start_date: string; target_date: string } {
  const startIndex = Math.max(0, Math.round(leftPx / dayWidth));
  const days = Math.max(1, Math.round(widthPx / dayWidth));
  const start = addDays(chartStart, startIndex);
  const target = addDays(start, days - 1);
  return { start_date: formatISODate(start), target_date: formatISODate(target) };
}

/** Build the PATCH for a drag commit under Plane half-block rules. */
export function getTimelineDragPatch(opts: {
  leftPx: number;
  widthPx: number;
  chartStart: Date;
  dayWidth: number;
  hadStart: boolean;
  hadTarget: boolean;
  dragMode: "left" | "right" | "move";
}): { start_date?: string | null; target_date?: string | null } {
  const dates = getDatesFromBarPixels(
    opts.leftPx,
    opts.widthPx,
    opts.chartStart,
    opts.dayWidth,
  );
  const completingHalf =
    (opts.dragMode === "left" && !opts.hadStart) ||
    (opts.dragMode === "right" && !opts.hadTarget);

  if (opts.dragMode === "move" || completingHalf || (opts.hadStart && opts.hadTarget)) {
    return { start_date: dates.start_date, target_date: dates.target_date };
  }

  const patch: { start_date?: string | null; target_date?: string | null } = {};
  if (opts.hadStart || opts.dragMode === "left") patch.start_date = dates.start_date;
  if (opts.hadTarget || opts.dragMode === "right") patch.target_date = dates.target_date;
  return patch;
}

export function getDurationDays(project: IScheduled): number {
  return Math.max(
    daysBetween(parseDate(project.start_date), parseDate(project.target_date)) + 1,
    1,
  );
}

/** UTC date-only string (YYYY-MM-DD) for story schedule fields. */
export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Map a horizontal pixel offset on the chart to a calendar day. */
export function getDateFromPixel(
  pixelX: number,
  chartStart: Date,
  dayWidth: number,
): Date {
  const dayIndex = Math.max(0, Math.floor(pixelX / dayWidth));
  return addDays(chartStart, dayIndex);
}

/** Pixel offset of the today line, or null if today is outside the chart range. */
export function getTodayOffset(
  chartStart: Date,
  totalDays: number,
  dayWidth: number,
): number | null {
  const days = daysBetween(chartStart, todayUTC());
  if (days < 0 || days >= totalDays) return null;
  return days * dayWidth;
}
