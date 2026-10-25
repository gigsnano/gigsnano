/**
 * Sizing constants shared by the dashboard charts (GIN-527).
 *
 * Kept out of the component file so Fast Refresh can preserve chart state on
 * edit — a module exporting both a component and plain values forces a reload.
 */

/**
 * Widget-sized chart margins. The chart library defaults to 40 on every side,
 * which is most of a short widget's height; these keep only the gutters the axes
 * need — left for the y tick labels, bottom for the date strip.
 */
export const CHART_MARGIN = { top: 8, right: 12, bottom: 22, left: 34 };

/** Margins for the compact state, which draws no x-axis strip. */
export const COMPACT_MARGIN = { ...CHART_MARGIN, bottom: 4 };

/**
 * Below this the axis strip and legend crowd the plot out, so a compact chart is
 * drawn instead of a squashed unreadable one. The grid's per-widget minSize
 * keeps a normal widget well above this; it is the floor for the pathological
 * cases — a very short persona row, a zoomed-in browser.
 */
export const COMPACT_BELOW = 150;

/** Roughly the width one date label needs before neighbours start colliding. */
export const PX_PER_TICK = 72;

/**
 * How long the box must hold still before the chart is re-measured.
 *
 * The chart library sizes itself from its own observer and keeps whatever it
 * measured first, so a widget that changes size draws its series into the old
 * plot — bars laid out for a narrower box end well short of the axis, which is
 * the "the chart just stops halfway" report. Remounting it is what forces a
 * fresh measurement, and remounting mid-drag would replay the enter animation
 * on every frame, so it waits for the drag to stop.
 */
export const RESIZE_SETTLE_MS = 180;
