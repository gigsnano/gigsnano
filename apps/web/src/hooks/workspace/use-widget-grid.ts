"use client";

import { useRef, useState } from "react";
import type { Layout } from "react-grid-layout";

import {
  EDashboardWidgetType,
  type IDashboard,
  type IDashboardConfig,
  type IDashboardFilters,
  type IDashboardWidget,
  type IWidgetSettings,
} from "@/types";
import { MAX_WIDGETS, WIDGET_TYPES } from "@/components/dashboards/widgets/widget-registry";

import { useUpdateDashboard } from "./use-dashboards";

const COLS = 12;

/** Map stored widgets to react-grid-layout items (adds min-size constraints). */
export function toLayout(widgets: IDashboardWidget[]): Layout[] {
  return widgets.map((w) => {
    const min = WIDGET_TYPES[w.type]?.minSize ?? { w: 2, h: 2 };
    return { i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: min.w, minH: min.h };
  });
}

/** Merge a react-grid-layout result back into widgets by id. */
function applyLayout(widgets: IDashboardWidget[], layout: Layout[]): IDashboardWidget[] {
  const byId = new Map(layout.map((l) => [l.i, l]));
  return widgets.map((w) => {
    const l = byId.get(w.id);
    return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
  });
}

function samePositions(a: IDashboardWidget[], b: IDashboardWidget[]): boolean {
  if (a.length !== b.length) return false;
  const bById = new Map(b.map((w) => [w.id, w]));
  return a.every((w) => {
    const o = bById.get(w.id);
    return o != null && o.x === w.x && o.y === w.y && o.w === w.w && o.h === w.h;
  });
}

/**
 * Widget add/remove/move/resize state for one dashboard, plus its persistence.
 *
 * Lives outside the grid so the toolbar can render in the page header while the
 * grid renders in the content — both need the same widget list, and the count
 * has to stay honest when a widget is added or removed.
 *
 * State is seeded once from the server config; the caller must mount its owner
 * keyed by dashboard id so switching dashboards remounts with a fresh seed.
 */
export function useWidgetGrid(dashboard: IDashboard, workspaceSlug: string) {
  const [widgets, setWidgets] = useState<IDashboardWidget[]>(dashboard.config.widgets);
  // The dashboard-wide filter lives here too: both are halves of one `config`,
  // and a single writer is what keeps one save from clobbering the other.
  const [filters, setFiltersState] = useState<IDashboardFilters>(
    () => dashboard.config.filters ?? {},
  );
  const update = useUpdateDashboard(workspaceSlug);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (config: IDashboardConfig, { debounce }: { debounce: boolean }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const run = () =>
      update.mutate({
        dashboardId: dashboard.id,
        payload: { config: { ...dashboard.config, ...config } },
      });
    if (debounce) saveTimer.current = setTimeout(run, 600);
    else run();
  };

  const commit = (next: IDashboardWidget[], debounce = false) => {
    setWidgets(next);
    persist({ widgets: next, filters }, { debounce });
  };

  // Debounced like a drag: picking three projects in a row is one save, not three.
  const setFilters = (next: IDashboardFilters) => {
    setFiltersState(next);
    persist({ widgets, filters: next }, { debounce: true });
  };

  const handleLayoutChange = (layout: Layout[]) => {
    const next = applyLayout(widgets, layout);
    if (samePositions(next, widgets)) return; // mount echo / no-op — don't churn
    commit(next, true);
  };

  const addWidget = (type: EDashboardWidgetType) => {
    if (widgets.length >= MAX_WIDGETS) return;
    const meta = WIDGET_TYPES[type];
    const bottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    commit([
      ...widgets,
      {
        id: `wdg_${type}_${bottom}_${widgets.length}`,
        type,
        title: meta.label,
        x: 0,
        y: bottom,
        w: meta.defaultSize.w,
        h: meta.defaultSize.h,
      },
    ]);
  };

  const removeWidget = (id: string) => commit(widgets.filter((w) => w.id !== id));

  const updateSettings = (id: string, settings: IWidgetSettings) =>
    commit(widgets.map((w) => (w.id === id ? { ...w, settings } : w)));

  // Non-destructive "reset to default layout": restore each widget to its type's
  // default size and re-flow left-to-right into the 12-col grid, keeping widgets
  // and their filters. Vertical compaction tidies the result.
  const resetLayout = () => {
    let x = 0;
    let y = 0;
    let rowH = 0;
    commit(
      widgets.map((w) => {
        const { defaultSize } = WIDGET_TYPES[w.type];
        if (x + defaultSize.w > COLS) {
          x = 0;
          y += rowH;
          rowH = 0;
        }
        const placed = { ...w, x, y, w: defaultSize.w, h: defaultSize.h };
        x += defaultSize.w;
        rowH = Math.max(rowH, defaultSize.h);
        return placed;
      }),
    );
  };

  return {
    widgets,
    filters,
    setFilters,
    atMax: widgets.length >= MAX_WIDGETS,
    max: MAX_WIDGETS,
    addWidget,
    removeWidget,
    updateSettings,
    resetLayout,
    handleLayoutChange,
  };
}

export type TWidgetGrid = ReturnType<typeof useWidgetGrid>;
