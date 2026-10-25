"use client";

import { FilterHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";

/** Shown when active filters leave the graph with nothing to render. */
export function GraphEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl border bg-card">
        <HugeiconsIcon icon={FilterHorizontalIcon} className="size-5 text-muted-foreground" />
      </div>
      <div>
        <div className="text-sm font-medium text-foreground">No nodes match the current filters</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Adjust or clear the active filters to see the graph.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onClear} className="active:scale-[0.97]">
        Clear filters
      </Button>
    </div>
  );
}
