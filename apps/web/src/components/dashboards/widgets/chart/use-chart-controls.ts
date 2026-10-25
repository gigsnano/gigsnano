"use client";

import { useState } from "react";

import { useDashboardFilter } from "@/hooks/workspace/use-dashboard-filter";
import { chartWindow, dashboardWindow, resolveDateRange } from "@/lib/dashboards/widget-filters";
import type { EWidgetDateRange, IDashboardActivityParams, IWidgetSettings } from "@/types";

import { periodFor, type IChartPeriod } from "./chart-series";

export interface IChartControls {
  range: EWidgetDateRange;
  setRange: (range: EWidgetDateRange) => void;
  period: IChartPeriod;
  /** Query params for whichever chart endpoint the caller reads. */
  params: IDashboardActivityParams;
  hidden: ReadonlySet<string>;
  toggle: (key: string, seriesCount: number) => void;
  /** The dashboard filter sets the window; the chart's own period switch yields. */
  locked: boolean;
}

/**
 * Period and series-visibility state for a chart widget (GIN-527).
 *
 * Separate from the chart itself so each widget body can call its own data hook
 * with these params — hooks are not values and cannot be handed to a shared
 * component as a prop.
 *
 * Both choices are deliberately local rather than persisted to the widget: the
 * ticket asks that they survive while the user is on the page, and the widget's
 * stored `date_range` is the starting point, not a running record of every
 * glance at another period.
 */
export function useChartControls(settings?: IWidgetSettings): IChartControls {
  const [range, setRange] = useState<EWidgetDateRange>(
    () => periodFor(settings?.date_range).range,
  );
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  // A dashboard-wide window overrides the chart's own period, fitted to what
  // the chart endpoints accept.
  const dashWindow = dashboardWindow(useDashboardFilter());
  const fitted = dashWindow ? chartWindow(dashWindow) : null;
  const period = fitted ? { ...periodFor(range), bucket: fitted.bucket } : periodFor(range);
  const toggle = (key: string, seriesCount: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      // Never hide the last one: an empty chart isn't a state worth reaching by
      // clicking, and there'd be nothing left to read your way back out of it.
      if (next.has(key)) next.delete(key);
      else if (next.size < seriesCount - 1) next.add(key);
      return next;
    });

  return {
    range,
    setRange,
    period,
    params: fitted
      ? { project_id: settings?.project_id, ...fitted }
      : {
          project_id: settings?.project_id,
          bucket: period.bucket,
          ...resolveDateRange({ ...settings, date_range: range }),
        },
    hidden,
    toggle,
    locked: Boolean(fitted),
  };
}
