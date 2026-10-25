"use client";

import { useWorkspaceAnalytics } from "@/hooks/workspace/use-analytics";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

/** Human "ends in" label from an end date, or null when there's no date. */
function endsInLabel(endDate: string | null): string | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const today = new Date();
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends in 1 day";
  return `Ends in ${days} days`;
}

/**
 * GIN-118 — Active sprint status. Each active cycle's completion as a progress
 * meter with its project + an "ends in N days" hint. All from workspace analytics.
 */
export function SprintStatusBody({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError } = useWorkspaceAnalytics(workspaceSlug);

  if (isPending) return <WidgetSkeleton rows={4} />;
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load sprint status.</WidgetMessage>;

  const cycles = data.active_cycle_details;
  if (cycles.length === 0) return <WidgetMessage>No active sprints right now.</WidgetMessage>;

  return (
    <ul className="gn-stagger flex flex-col gap-3.5 p-4">
      {cycles.map((c) => {
        const pct = c.story_count ? Math.round((c.completed_story_count / c.story_count) * 100) : 0;
        const ends = endsInLabel(c.end_date);
        return (
          <li key={c.cycle_id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium">{c.cycle_name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {c.project_name}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="gn-grow-bar h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            {ends ? (
              <span className="text-[11px] text-muted-foreground">
                {ends} · {c.completed_story_count}/{c.story_count} done
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {c.completed_story_count}/{c.story_count} done
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
