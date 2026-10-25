"use client";

import "react-grid-layout/css/styles.css";
import "./widget-grid.css";

import GridLayout, { WidthProvider } from "react-grid-layout";

import { EmptyState } from "@/components/empty-state";
import { toLayout, type TWidgetGrid } from "@/hooks/workspace/use-widget-grid";

import { WidgetFrame } from "./widget-frame";

const GridWithWidth = WidthProvider(GridLayout);

const COLS = 12;
const ROW_HEIGHT = 64;

/**
 * The board itself. State lives in `useWidgetGrid` above this, because the
 * toolbar that mutates it renders in the page header.
 */
export function WidgetGrid({
  grid,
  workspaceSlug,
}: {
  grid: TWidgetGrid;
  workspaceSlug: string;
}) {
  if (grid.widgets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-10">
        <EmptyState
          assetKey="generic"
          title="Build your dashboard"
          description="Add widgets — work-item lists, charts, counters and activity feeds — then drag and resize them into the layout you want."
        />
      </div>
    );
  }

  return (
    <GridWithWidth
      className="dashboard-grid"
      layout={toLayout(grid.widgets)}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      draggableHandle=".widget-drag-handle"
      resizeHandles={["se"]}
      compactType="vertical"
      onLayoutChange={grid.handleLayoutChange}
    >
      {grid.widgets.map((widget) => (
        <div key={widget.id}>
          <WidgetFrame
            widget={widget}
            ctx={{ workspaceSlug }}
            editable
            onRemove={grid.removeWidget}
            onUpdateSettings={grid.updateSettings}
          />
        </div>
      ))}
    </GridWithWidth>
  );
}
