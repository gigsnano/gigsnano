"use client";

import { EmptyState } from "@/components/empty-state";
import type { ICycle } from "@/types";

import { ActiveCycleCard } from "./active-cycle-card";

export function ActiveCycles({
  cycles,
  workspaceSlug,
  projectId,
}: {
  cycles: ICycle[];
  workspaceSlug: string;
  projectId: string;
}) {
  if (cycles.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="sprint"
          title="No active cycle"
          description="Start a cycle to track delivery with a burn-down chart and progress breakdown."
        />
      </div>
    );
  }

  return (
    <div className="border-t">
      {cycles.map((cycle, i) => (
        <ActiveCycleCard
          key={cycle.id}
          cycle={cycle}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          defaultExpanded={i === 0}
        />
      ))}
    </div>
  );
}
