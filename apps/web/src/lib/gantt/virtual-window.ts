/**
 * Row windowing for the Gantt timeline (GIN-119).
 *
 * Gantt rows are a fixed height (GANTT_ROW_HEIGHT), which is what keeps this to
 * arithmetic instead of a virtualiser dependency: with uniform rows the visible
 * slice is a division, and the rows above/below collapse into two spacer divs
 * that preserve total scroll height. No measurement, no observers per row.
 *
 * The sidebar rail and the chart must window identically or their rows drift out
 * of alignment, so both consume one result.
 */

export interface IVirtualWindow {
  /** First row index to render (inclusive). */
  first: number;
  /** Last row index to render (exclusive). */
  last: number;
  /** Spacer height standing in for rows above `first`. */
  padTop: number;
  /** Spacer height standing in for rows below `last`. */
  padBottom: number;
}

export interface IVirtualWindowOptions {
  total: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  /** Sticky header above the rows — it holds its space in flow, so rows start below it. */
  headerHeight: number;
  /** Extra rows rendered beyond the viewport so a fast scroll doesn't show gaps. */
  overscan?: number;
}

const DEFAULT_OVERSCAN = 6;

export function virtualWindow({
  total,
  scrollTop,
  viewportHeight,
  rowHeight,
  headerHeight,
  overscan = DEFAULT_OVERSCAN,
}: IVirtualWindowOptions): IVirtualWindow {
  if (total <= 0 || rowHeight <= 0) {
    return { first: 0, last: 0, padTop: 0, padBottom: 0 };
  }
  // Rows begin headerHeight into the scrollable content; above that the offset is
  // negative, which floors below zero — clamp rather than render a negative index.
  const rowsScrolled = Math.floor((scrollTop - headerHeight) / rowHeight);
  const first = Math.min(Math.max(rowsScrolled - overscan, 0), Math.max(total - 1, 0));
  const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const last = Math.min(first + Math.max(visible, 1), total);
  return {
    first,
    last,
    padTop: first * rowHeight,
    padBottom: (total - last) * rowHeight,
  };
}
