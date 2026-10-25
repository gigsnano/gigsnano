"use client";

import { useWorkspaceAnalytics } from "@/hooks/workspace/use-analytics";
import { EmptyState } from "@/components/empty-state";

export function AnalyticsVelocity({ workspaceSlug }: { workspaceSlug: string }) {
  const analytics = useWorkspaceAnalytics(workspaceSlug);

  if (analytics.isPending) {
    return <div className="m-6 h-48 animate-pulse rounded-lg border bg-card" />;
  }

  if (analytics.isError || !analytics.data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load velocity"
          description="Something went wrong fetching sprint metrics."
          actions={[{ label: "Retry", onClick: () => analytics.refetch() }]}
        />
      </div>
    );
  }

  const rows = analytics.data.velocity ?? [];

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="sprint"
          title="No velocity data yet"
          description="Complete a delivery sprint to see throughput metrics here."
        />
      </div>
    );
  }

  return (
    <section className="m-6 rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold">Sprint velocity</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Stories completed vs committed per active sprint.
      </p>
      <ul className="mt-4 space-y-4">
        {rows.map((row) => {
          const pct = row.committed > 0 ? Math.round((row.completed / row.committed) * 100) : 0;
          return (
            <li key={`${row.project_name}-${row.cycle_name}`}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">
                  {row.cycle_name}{" "}
                  <span className="text-muted-foreground">· {row.project_name}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {row.completed}/{row.committed} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
