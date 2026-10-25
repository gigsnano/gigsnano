"use client";

import { useWorkspaceAnalytics } from "@/hooks/workspace/use-analytics";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

/**
 * GIN-118 — Sprint velocity. Committed vs completed per recent cycle as paired
 * vertical bars. Data from workspace analytics.
 */
export function VelocityBody({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError } = useWorkspaceAnalytics(workspaceSlug);

  if (isPending) return <WidgetSkeleton rows={3} />;
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load velocity.</WidgetMessage>;

  const cycles = data.velocity;
  if (cycles.length === 0) return <WidgetMessage>No completed sprints yet.</WidgetMessage>;

  const max = Math.max(1, ...cycles.map((c) => Math.max(c.committed, c.completed)));

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/30" /> Committed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Completed
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-end justify-around gap-2">
        {cycles.map((c) => (
          <div
            key={`${c.project_name}·${c.cycle_name}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-1/2 max-w-4 rounded-t bg-muted-foreground/25"
                style={{ height: `${(c.committed / max) * 100}%` }}
                title={`Committed: ${c.committed}`}
              />
              <div
                className="w-1/2 max-w-4 rounded-t bg-primary"
                style={{ height: `${(c.completed / max) * 100}%` }}
                title={`Completed: ${c.completed}`}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {c.cycle_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
