"use client";

import Link from "next/link";

import { useWorkspaceAnalytics } from "@/hooks/workspace/use-analytics";
import { EmptyState } from "@/components/empty-state";

export function AnalyticsActiveCycles({ workspaceSlug }: { workspaceSlug: string }) {
  const analytics = useWorkspaceAnalytics(workspaceSlug);

  if (analytics.isPending) {
    return <div className="m-6 h-48 animate-pulse rounded-lg border bg-card" />;
  }

  if (analytics.isError || !analytics.data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load cycles"
          description="Something went wrong fetching active sprint data."
          actions={[{ label: "Retry", onClick: () => analytics.refetch() }]}
        />
      </div>
    );
  }

  const rows = analytics.data.active_cycle_details ?? [];

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="sprint"
          title="No active cycles"
          description="Start a sprint from a project's Cycles tab to see it here."
          actions={[{ label: "View projects", href: `/${workspaceSlug}/projects` }]}
        />
      </div>
    );
  }

  return (
    <section className="m-6 rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold">Active cycles</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sprints in progress across the workspace.
      </p>
      <ul className="mt-4 divide-y">
        {rows.map((row) => {
          const pct =
            row.story_count > 0
              ? Math.round((row.completed_story_count / row.story_count) * 100)
              : 0;
          return (
            <li key={row.cycle_id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.cycle_name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.project_name}
                  {row.end_date ? ` · ends ${row.end_date}` : ""}
                </p>
                <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm tabular-nums text-muted-foreground">
                  {row.completed_story_count}/{row.story_count}
                </p>
                <Link
                  href={`/${workspaceSlug}/projects/${row.project_id}/cycles/${row.cycle_id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
