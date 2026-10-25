import {
  EGanttZoom,
  GANTT_VIEWS,
} from "@/components/projects/views/gantt/gantt-config";
import {
  buildDayColumns,
  buildWeekColumns,
  getChartRange,
  getDurationDays,
  getTimelineBarPosition,
  groupDaysByMonth,
  groupWeeksByMonth,
  type IMonthGroup,
} from "@/components/projects/views/gantt/gantt-date-math";
import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

/**
 * Pure view-model for the Gantt → Excel export (GIN-84). Derives, from the exact
 * stories the Gantt renders (already filtered + ordered by the caller), the same
 * timeline geometry the on-screen chart uses: a Monday-snapped column axis (days
 * in Week zoom, weeks in Month/Quarter) with month bands, and per-task bar
 * placement as inclusive column indices. `write-gantt-workbook.ts` turns this
 * into a styled .xlsx; keeping it pure keeps the layout logic unit-testable and
 * out of the I/O layer.
 */

export type TGanttGranularity = "day" | "week";

/** Excel needs concrete colors, not Tailwind tokens — ARGB matching the app's
 *  status palette (blue-500 / amber-500 / emerald-500 / gray-400). */
const STATUS_EXPORT: Record<EStoryStatus, { label: string; argb: string; progress: number }> = {
  [EStoryStatus.Todo]: { label: "To do", argb: "FF9CA3AF", progress: 0 },
  [EStoryStatus.InProgress]: { label: "In progress", argb: "FF3B82F6", progress: 50 },
  [EStoryStatus.InReview]: { label: "In review", argb: "FFF59E0B", progress: 80 },
  [EStoryStatus.Done]: { label: "Done", argb: "FF10B981", progress: 100 },
};

const PRIORITY_LABEL: Record<EStoryPriority, string> = {
  [EStoryPriority.Urgent]: "Urgent",
  [EStoryPriority.High]: "High",
  [EStoryPriority.Medium]: "Medium",
  [EStoryPriority.Low]: "Low",
  [EStoryPriority.None]: "—",
};

export interface IGanttExportColumn {
  /** Day-of-month (Week zoom) or week-start day (Month/Quarter zoom). */
  label: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface IGanttExportRow {
  code: string;
  title: string;
  status: string;
  /** ARGB fill for this task's timeline bar. */
  statusArgb: string;
  priority: string;
  assignee: string;
  startDate: string;
  targetDate: string;
  durationDays: number | null;
  progressPct: number;
  /** Inclusive column indices of the bar, or null when the task has no dates. */
  barStartIndex: number | null;
  barEndIndex: number | null;
  /** Only one date set → a single-cell milestone marker rather than a span. */
  isMilestone: boolean;
}

export interface IGanttExportModel {
  granularity: TGanttGranularity;
  monthGroups: IMonthGroup[];
  columns: IGanttExportColumn[];
  rows: IGanttExportRow[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function buildGanttExportModel(opts: {
  /** Already filtered + ordered exactly as the Gantt renders them. */
  stories: IStory[];
  zoom: EGanttZoom;
  getAssigneeName: (assigneeId: string | null) => string;
  getCode: (story: IStory) => string;
}): IGanttExportModel {
  const { stories, zoom, getAssigneeName, getCode } = opts;
  const view = GANTT_VIEWS[zoom];
  const granularity: TGanttGranularity = zoom === EGanttZoom.Week ? "day" : "week";

  const dated = stories.filter((s) => s.start_date || s.target_date);
  const { chartStart, totalDays } = getChartRange(
    dated.map((s) => ({ start_date: s.start_date, target_date: s.target_date })),
    view.paddingDays,
  );

  let columns: IGanttExportColumn[];
  let monthGroups: IMonthGroup[];
  if (granularity === "day") {
    const dayCols = buildDayColumns(chartStart, totalDays);
    columns = dayCols.map((c) => ({
      label: String(c.date.getUTCDate()),
      isToday: c.isToday,
      isWeekend: c.isWeekend,
    }));
    monthGroups = groupDaysByMonth(dayCols);
  } else {
    const weekCols = buildWeekColumns(chartStart, totalDays);
    columns = weekCols.map((c) => ({ label: c.label, isToday: c.isCurrent, isWeekend: false }));
    monthGroups = groupWeeksByMonth(weekCols);
  }
  const colCount = columns.length;
  const toCol = (day: number) => (granularity === "day" ? day : Math.floor(day / 7));

  const rows = stories.map<IGanttExportRow>((s) => {
    const status = STATUS_EXPORT[s.status];
    const hasBoth = Boolean(s.start_date && s.target_date);
    const isMilestone = Boolean((s.start_date || s.target_date) && !hasBoth);

    // dayWidth = 1 → left is the start-day offset, width the inclusive span in days.
    const pos = getTimelineBarPosition(
      { start_date: s.start_date, target_date: s.target_date },
      chartStart,
      1,
      1,
    );
    let barStartIndex: number | null = null;
    let barEndIndex: number | null = null;
    if (pos && colCount > 0) {
      const startDay = Math.round(pos.left);
      const endDay = startDay + Math.round(pos.width) - 1;
      barStartIndex = clamp(toCol(startDay), 0, colCount - 1);
      barEndIndex = clamp(toCol(endDay), 0, colCount - 1);
    }

    return {
      code: getCode(s),
      title: s.title,
      status: status.label,
      statusArgb: status.argb,
      priority: PRIORITY_LABEL[s.priority],
      assignee: getAssigneeName(s.assignee_id),
      startDate: s.start_date ?? "",
      targetDate: s.target_date ?? "",
      durationDays: hasBoth
        ? getDurationDays({ start_date: s.start_date!, target_date: s.target_date! })
        : null,
      progressPct: status.progress,
      barStartIndex,
      barEndIndex,
      isMilestone,
    };
  });

  return { granularity, monthGroups, columns, rows };
}
