"use client";

import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageBarChart } from "@/components/billing/usage/usage-bar-chart";
import { UsageBreakdown } from "@/components/billing/usage/usage-breakdown";
import { useWorkspaceUsage } from "@/hooks/billing/use-ai-usage";
import { formatCostCents } from "@/lib/ai-cost/format";

export function UsageDashboard({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useWorkspaceUsage(workspaceSlug);

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load AI usage"
        description="Something went wrong fetching your workspace's AI cost."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (data.event_count === 0) {
    return (
      <EmptyState
        assetKey="generic"
        title="No AI usage yet"
        description="Cost from AI agents and generations will show up here once your team starts using them."
        actions={[{ label: "Open a project", href: `/${workspaceSlug}` }]}
      />
    );
  }

  const delta = data.prior_period?.delta_cost_pct;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            AI cost · last {data.timeseries.length} days
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCostCents(data.total_cost_cents)}
          </p>
        </div>
        {delta != null ? (
          <span
            className={
              delta > 0
                ? "text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400"
                : delta < 0
                  ? "text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
                  : "text-xs font-medium tabular-nums text-muted-foreground"
            }
          >
            {delta > 0 ? "▲ " : delta < 0 ? "▼ " : ""}
            {Math.abs(Math.round(delta * 100))}% vs prior
          </span>
        ) : null}
      </div>

      <UsageBarChart points={data.timeseries} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <UsageBreakdown title="By project" entries={data.by_project} />
        <UsageBreakdown title="By agent" entries={data.by_agent} />
        <UsageBreakdown title="By member" entries={data.by_member} />
      </div>
    </div>
  );
}
