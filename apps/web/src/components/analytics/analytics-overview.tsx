"use client";

import Link from "next/link";

import { useWorkspaceAnalytics } from "@/hooks/workspace/use-analytics";
import { EmptyState } from "@/components/empty-state";

export function AnalyticsOverview({ workspaceSlug }: { workspaceSlug: string }) {
  const analytics = useWorkspaceAnalytics(workspaceSlug);

  if (analytics.isPending) {
    return (
      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }

  if (analytics.isError || !analytics.data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load analytics"
          description="Something went wrong fetching workspace metrics."
          actions={[{ label: "Retry", onClick: () => analytics.refetch() }]}
        />
      </div>
    );
  }

  const a = analytics.data;
  const stats = [
    { label: "Projects", value: a.total_projects, sub: `${a.active_projects} active` },
    { label: "Active sprints", value: a.active_cycles, sub: "Across all projects" },
    { label: "Stories done", value: a.completed_stories, sub: `of ${a.total_stories} total` },
    { label: "Sprint-0 complete", value: a.sprint_zero_complete, sub: `${a.members_active} members` },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Sprint-0 progress by project</h2>
        <ul className="mt-4 space-y-3">
          {a.project_progress.map((p) => (
            <li key={p.project_id}>
              <div className="mb-1 flex justify-between text-sm">
                <Link
                  href={`/${workspaceSlug}/projects/${p.project_id}`}
                  className="font-medium hover:text-primary"
                >
                  {p.project_name}{" "}
                  <span className="text-muted-foreground">({p.identifier})</span>
                </Link>
                <span className="tabular-nums text-muted-foreground">{p.progress_pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${p.progress_pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
