"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

import { useWorkspaceStoriesPage } from "@/hooks/story/use-stories";
import { useDashboardFilter } from "@/hooks/workspace/use-dashboard-filter";
import { filterStories, withDashboardWindow } from "@/lib/dashboards/widget-filters";
import { storyRisk, type TRiskLevel } from "@/lib/dashboards/story-risk";
import { STORY_STATUS_META } from "@/constants/story-meta";
import { cn } from "@/lib/utils";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

const TONE: Record<TRiskLevel, string> = {
  overdue: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  high: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

/**
 * GIN-89 — Risk list. Open work items at delivery risk (overdue first, then
 * urgent/high), surfaced across every board + the persona dashboards. Real data:
 * derived from workspace stories via the shared `storyRisk` heuristic.
 */
export function RiskListBody({ workspaceSlug }: { workspaceSlug: string }) {
  // Workspace-wide risk list; product items only (skips BMAD Sprint-0 cards).
  const dashboardFilter = useDashboardFilter();
  const { data, isPending, isError } = useWorkspaceStoriesPage(workspaceSlug, {
    limit: 100,
    product_only: true,
    project_ids: dashboardFilter?.project_ids,
  });

  if (isPending) return <WidgetSkeleton />;
  if (isError) return <WidgetMessage>Couldn&apos;t load risks.</WidgetMessage>;

  const now = new Date();
  const risky = filterStories(data?.items ?? [], withDashboardWindow(undefined, dashboardFilter))
    .map((s) => ({ story: s, risk: storyRisk(s, now) }))
    .filter((r): r is { story: (typeof r)["story"]; risk: NonNullable<(typeof r)["risk"]> } =>
      r.risk !== null,
    )
    .sort((a, b) => b.risk.weight - a.risk.weight)
    .slice(0, 12);

  if (!risky.length) return <WidgetMessage>No at-risk work — all on track.</WidgetMessage>;

  return (
    <ul className="divide-y">
      {risky.map(({ story: s, risk }) => {
        const status = STORY_STATUS_META[s.status];
        return (
          <li key={s.id}>
            <Link
              href={`/${workspaceSlug}/projects/${s.project_id}/issues/${s.id}`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50"
            >
              <HugeiconsIcon
                icon={Alert02Icon}
                className={cn(
                  "size-3.5 shrink-0",
                  risk.level === "overdue" ? "text-red-500" : "text-amber-500",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium", TONE[risk.level])}>
                {risk.reason}
              </span>
              <HugeiconsIcon icon={status.icon} className={cn("size-3.5 shrink-0", status.color)} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
