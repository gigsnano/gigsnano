"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import { useMembers } from "@/hooks/workspace/use-members";
import { Avatar } from "@/components/ui/avatar";
import { STORY_STATUS_ORDER, STORY_STATUS_META } from "@/constants/story-meta";
import { EStoryStatus, type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

interface Row {
  id: string;
  name: string;
  avatar: string | null;
  counts: Record<string, number>;
  total: number;
}

/**
 * GIN-164 — Per-person work breakdown: a row per assignee, a column per status.
 *
 * Keyed on `assignee_id` (who owns the item), not on who last touched it. Most
 * work items carry no assignee, so the Unassigned row is usually the largest —
 * that reflects the data, and sorting by volume keeps it from hiding.
 */
export function AssigneeActivityBody({
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
    return <WidgetMessage>Couldn&apos;t load per-person activity.</WidgetMessage>;
  }

  const byId = new Map((members.data ?? []).map((m) => [m.user_id, m]));
  const rows: Row[] = [];
  for (const [id, counts] of Object.entries(metrics.data.assignee_status_counts)) {
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total <= 0) continue;
    rows.push({
      id,
      name: id === "unassigned" ? "Unassigned" : (byId.get(id)?.display_name ?? "Unknown"),
      avatar: byId.get(id)?.avatar_url ?? null,
      counts,
      total,
    });
  }
  rows.sort((a, b) => b.total - a.total);

  if (rows.length === 0) return <WidgetMessage>No work items match this widget.</WidgetMessage>;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-[11px] text-muted-foreground">
            <th scope="col" className="px-3 py-1.5 text-left font-medium">
              Assignee
            </th>
            {STORY_STATUS_ORDER.map((s) => (
              <th key={s} scope="col" className="px-2 py-1.5 text-right font-medium">
                {STORY_STATUS_META[s as EStoryStatus].label}
              </th>
            ))}
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/40">
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  {row.id === "unassigned" ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                      —
                    </span>
                  ) : (
                    <Avatar name={row.name} src={row.avatar} size="sm" />
                  )}
                  <span className="truncate text-xs">{row.name}</span>
                </div>
              </td>
              {STORY_STATUS_ORDER.map((s) => (
                <td
                  key={s}
                  className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground"
                >
                  {row.counts[s] ?? 0}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
