"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import { useMembers } from "@/hooks/workspace/use-members";
import { Avatar } from "@/components/ui/avatar";
import { type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

interface Row {
  id: string;
  name: string;
  avatar: string | null;
  count: number;
}

/**
 * GIN-118 — Team workload. Each member's open-work load as an avatar row + meter,
 * sorted heaviest-first. Counts come from the metrics endpoint's assignee_counts;
 * names/avatars resolve from workspace members.
 */
export function TeamWorkloadBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  const metrics = useDashboardMetrics(workspaceSlug, toMetricsParams(settings));
  const members = useMembers(workspaceSlug);

  if (metrics.isPending || members.isPending) return <WidgetSkeleton rows={5} />;
  if (metrics.isError || !metrics.data) {
    return <WidgetMessage>Couldn&apos;t load workload.</WidgetMessage>;
  }

  const counts = metrics.data.assignee_counts;
  const byId = new Map((members.data ?? []).map((m) => [m.user_id, m]));

  // Single pass to build non-empty rows, then sort heaviest-first.
  const rows: Row[] = [];
  for (const [id, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const m = byId.get(id);
    rows.push({
      id,
      name: id === "unassigned" ? "Unassigned" : (m?.display_name ?? "Unknown"),
      avatar: m?.avatar_url ?? null,
      count,
    });
  }
  rows.sort((a, b) => b.count - a.count);

  if (rows.length === 0) return <WidgetMessage>No assigned work yet.</WidgetMessage>;

  const max = rows[0].count;

  return (
    <ul className="gn-stagger flex flex-col gap-2.5 p-4">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3">
          {row.id === "unassigned" ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              —
            </span>
          ) : (
            <Avatar name={row.name} src={row.avatar} size="sm" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{row.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.count}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="gn-grow-bar h-full rounded-full bg-primary/70"
                style={{ width: `${Math.round((row.count / max) * 100)}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
