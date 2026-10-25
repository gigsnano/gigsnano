/**
 * Geometry for the Gantt splitter — the divider between the timeline and the
 * unscheduled backlog. Pure so it unit-tests without the component, and so the
 * component file exports only a component (Fast Refresh keeps its state).
 */

/** Keeps the timeline and the backlog both usable at any drag position. */
export const GANTT_MIN_TIMELINE = 160;
export const GANTT_MIN_BACKLOG = 140;

/**
 * Clamp a proposed timeline height so neither pane can be dragged to nothing.
 * When the shell is too short to satisfy both minimums the timeline wins, rather
 * than collapsing the chart to an unusable sliver.
 */
export function clampTimelineHeight(next: number, available: number): number {
  const max = Math.max(GANTT_MIN_TIMELINE, available - GANTT_MIN_BACKLOG);
  return Math.min(max, Math.max(GANTT_MIN_TIMELINE, Math.round(next)));
}
