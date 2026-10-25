/**
 * dhtmlx-gantt zoom levels (GIN-350, Phase 2 of GIN-315).
 *
 * Each level is a multi-level timeline header (broad period on top, finer scale
 * below) plus a min column width, kept as plain data so it unit-tests without
 * loading dhtmlx. The canvas passes these straight to `gantt.config.scales`.
 * Formats are dhtmlx date-format strings (%Y year, %F full month, %M short month,
 * %j day-of-month, %W week-of-year).
 */

export const GANTT_ZOOM_LEVELS = ["day", "week", "month", "quarter", "year"] as const;
export type TGanttZoom = (typeof GANTT_ZOOM_LEVELS)[number];

export interface IGanttScaleRow {
  unit: string;
  step: number;
  format: string;
}

export interface IGanttZoomConfig {
  /** Top→bottom header rows for `gantt.config.scales`. */
  scales: IGanttScaleRow[];
  /** Min width (px) of the finest column, so labels stay readable. */
  minColumnWidth: number;
}

const CONFIGS: Record<TGanttZoom, IGanttZoomConfig> = {
  day: {
    scales: [
      { unit: "month", step: 1, format: "%F %Y" },
      { unit: "day", step: 1, format: "%j" },
    ],
    minColumnWidth: 40,
  },
  week: {
    scales: [
      { unit: "month", step: 1, format: "%F %Y" },
      { unit: "week", step: 1, format: "W%W" },
      { unit: "day", step: 1, format: "%j" },
    ],
    minColumnWidth: 28,
  },
  month: {
    scales: [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 1, format: "%M" },
    ],
    minColumnWidth: 90,
  },
  quarter: {
    scales: [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 3, format: "%M" },
    ],
    minColumnWidth: 120,
  },
  year: {
    scales: [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 1, format: "%M" },
    ],
    minColumnWidth: 30,
  },
};

/** dhtmlx scale/column config for a zoom level (defaults to week for junk input). */
export function zoomConfig(zoom: TGanttZoom): IGanttZoomConfig {
  return CONFIGS[zoom] ?? CONFIGS.week;
}

/**
 * The end of the period a scale cell covers. Needed because a cell is not always
 * one unit wide — the quarter zoom steps months by 3, so its July cell also
 * covers August and September.
 */
export function periodEnd(start: Date, unit: string, step = 1): Date {
  const end = new Date(start);
  if (unit === "year") end.setFullYear(end.getFullYear() + step);
  else if (unit === "month") end.setMonth(end.getMonth() + step);
  else if (unit === "week") end.setDate(end.getDate() + 7 * step);
  else end.setDate(end.getDate() + step);
  return end;
}

/**
 * True when `now` falls inside the period a scale cell starting at `start`
 * covers — the test behind the "today" highlight. Range-based rather than
 * field-by-field so one function is correct at every zoom, including stepped
 * scales, instead of a special case per unit.
 */
export function isCurrentPeriod(start: Date, now: Date, unit: string, step = 1): boolean {
  const t = now.getTime();
  return start.getTime() <= t && t < periodEnd(start, unit, step).getTime();
}

export const GANTT_ZOOM_LABEL: Record<TGanttZoom, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};
