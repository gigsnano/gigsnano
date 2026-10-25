"use client";

import { Button } from "@/components/ui/button";
import type { TWidgetGrid } from "@/hooks/workspace/use-widget-grid";

import { AddWidgetPicker } from "./add-widget-picker";

/**
 * Dashboard actions for the page header: widget count, reset, add.
 *
 * Rendered into AppHeader's `actions` rather than above the grid, so the content
 * area is only the board itself.
 */
export function DashboardToolbar({
  grid,
  onResetRequest,
}: {
  grid: TWidgetGrid;
  onResetRequest: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs tabular-nums text-muted-foreground">
        {grid.widgets.length}/{grid.max} widgets
      </p>
      {grid.widgets.length > 0 ? (
        <Button size="sm" variant="ghost" onClick={onResetRequest}>
          Reset layout
        </Button>
      ) : null}
      <AddWidgetPicker
        disabled={grid.atMax}
        addedTypes={grid.widgets.map((w) => w.type)}
        onAdd={grid.addWidget}
      />
    </div>
  );
}
