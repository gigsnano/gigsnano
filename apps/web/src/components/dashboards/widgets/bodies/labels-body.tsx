"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import { type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

/**
 * Jira parity — "Labels". Labels in use across the workspace with their item
 * counts, commonest first. Names/colours arrive denormalized on the metrics
 * response, so this needs no per-project label fetch.
 */
export function LabelsBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  const { data, isPending, isError } = useDashboardMetrics(
    workspaceSlug,
    toMetricsParams(settings),
  );

  if (isPending) return <WidgetSkeleton rows={4} />;
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load labels.</WidgetMessage>;
  if (data.label_counts.length === 0) {
    return <WidgetMessage>No labels in use yet.</WidgetMessage>;
  }

  return (
    <ul className="gn-stagger flex flex-wrap content-start gap-1.5 p-3">
      {data.label_counts.map((label) => (
        <li key={label.id}>
          <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              // Label colours are user-chosen data, not theme tokens.
              style={{ backgroundColor: label.color }}
            />
            <span className="truncate">{label.name}</span>
            <span className="tabular-nums text-muted-foreground">{label.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
