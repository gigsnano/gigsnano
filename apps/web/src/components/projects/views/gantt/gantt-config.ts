// src/components/projects/views/gantt/gantt-config.ts

/** Zoom levels for the projects Gantt (mirrors Plane's week/month/quarter). */
export enum EGanttZoom {
  Week = "week",
  Month = "month",
  Quarter = "quarter",
}

export interface IGanttView {
  label: string;
  /** Pixels per calendar day — all column widths derive from this. */
  dayWidth: number;
  /**
   * Days of padding on each side of today (Plane approxFilterRange).
   * Week ≈ ±4 months, Month ≈ ±6 months, Quarter ≈ ±24 months.
   */
  paddingDays: number;
  /** Inclusive days added to start when click-scheduling (Plane ChartAddBlock). */
  addBlockSpanDays: number;
}

/** Week → day columns (60px/day); Month/Quarter → week columns (dayWidth*7). */
export const GANTT_VIEWS: Record<EGanttZoom, IGanttView> = {
  [EGanttZoom.Week]: { label: "Week", dayWidth: 60, paddingDays: 120, addBlockSpanDays: 1 },
  [EGanttZoom.Month]: { label: "Month", dayWidth: 20, paddingDays: 180, addBlockSpanDays: 1 },
  [EGanttZoom.Quarter]: { label: "Quarter", dayWidth: 5, paddingDays: 720, addBlockSpanDays: 7 },
};

export const GANTT_ZOOM_ORDER: EGanttZoom[] = [
  EGanttZoom.Week,
  EGanttZoom.Month,
  EGanttZoom.Quarter,
];

/** Plane DEFAULT_BLOCK_WIDTH — fixed half-block width when only one date is set. */
export const DEFAULT_BLOCK_WIDTH = 60;

export const GANTT_ROW_HEIGHT = 44;
export const GANTT_HEADER_HEIGHT = 56;
export const GANTT_SIDEBAR_WIDTH = 280;
/** Rendered sidebar width: the full 280px from md up; on phones it caps at
 *  45vw so the timeline keeps most of the screen. */
export const GANTT_SIDEBAR_CSS_WIDTH = `min(${GANTT_SIDEBAR_WIDTH}px, 45vw)`;
