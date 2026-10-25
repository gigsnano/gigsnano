"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Folder01Icon,
  FolderOpenIcon,
  Rocket01Icon,
  UserGroupIcon,
  Analytics01Icon,
  Target01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import { useWorkspaceAnalytics } from "@/hooks/workspace/use-analytics";
import { EKpiMetric, EStoryStatus, type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";
import { cn } from "@/lib/utils";

import { WidgetMessage } from "./widget-body-shared";

interface KpiMeta {
  label: string;
  icon: IconSvgElement;
  /** Tailwind tint classes for the icon chip. */
  tint: string;
}

const KPI_META: Record<EKpiMetric, KpiMeta> = {
  [EKpiMetric.OpenItems]: { label: "Open work items", icon: Analytics01Icon, tint: "bg-primary/10 text-primary" },
  [EKpiMetric.InProgress]: { label: "In progress", icon: Target01Icon, tint: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  [EKpiMetric.InReview]: { label: "In review", icon: Analytics01Icon, tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  [EKpiMetric.Completed]: { label: "Completed", icon: CheckmarkCircle02Icon, tint: "bg-green-500/10 text-green-600 dark:text-green-400" },
  [EKpiMetric.ActiveProjects]: { label: "Active projects", icon: FolderOpenIcon, tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  [EKpiMetric.TotalProjects]: { label: "Total projects", icon: Folder01Icon, tint: "bg-primary/10 text-primary" },
  [EKpiMetric.ActiveCycles]: { label: "Active sprints", icon: Rocket01Icon, tint: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  [EKpiMetric.Members]: { label: "Team members", icon: UserGroupIcon, tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
};

/**
 * GIN-118 — KPI stat tile. One headline number from real workspace data
 * (analytics + the metrics endpoint). No fabricated deltas: we only show a
 * number we can stand behind.
 */
export function KpiBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  const metric = settings?.metric ?? EKpiMetric.OpenItems;
  const metrics = useDashboardMetrics(workspaceSlug, toMetricsParams(settings));
  const analytics = useWorkspaceAnalytics(workspaceSlug);

  const meta = KPI_META[metric];
  const value = resolveKpi(metric, metrics.data, analytics.data);

  if (value === null) {
    if (metrics.isError || analytics.isError) {
      return <WidgetMessage>Couldn&apos;t load metric.</WidgetMessage>;
    }
    return (
      <div className="flex h-full items-center gap-3 p-4">
        <div className="size-10 animate-pulse rounded-xl bg-muted" />
        <div className="flex flex-col gap-1.5">
          <div className="h-7 w-12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center gap-3 p-4">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", meta.tint)}>
        <HugeiconsIcon icon={meta.icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums leading-tight tracking-tight">
          {value}
        </div>
        <div className="truncate text-xs font-medium text-muted-foreground">{meta.label}</div>
      </div>
    </div>
  );
}

/** null → still loading (or unavailable). */
function resolveKpi(
  metric: EKpiMetric,
  metrics: { open: number; status_counts: Record<string, number> } | undefined,
  analytics:
    | { active_projects: number; total_projects: number; active_cycles: number; members_active: number }
    | undefined,
): number | null {
  switch (metric) {
    case EKpiMetric.OpenItems:
      return metrics ? metrics.open : null;
    case EKpiMetric.InProgress:
      return metrics ? (metrics.status_counts[EStoryStatus.InProgress] ?? 0) : null;
    case EKpiMetric.InReview:
      return metrics ? (metrics.status_counts[EStoryStatus.InReview] ?? 0) : null;
    case EKpiMetric.Completed:
      return metrics ? (metrics.status_counts[EStoryStatus.Done] ?? 0) : null;
    case EKpiMetric.ActiveProjects:
      return analytics ? analytics.active_projects : null;
    case EKpiMetric.TotalProjects:
      return analytics ? analytics.total_projects : null;
    case EKpiMetric.ActiveCycles:
      return analytics ? analytics.active_cycles : null;
    case EKpiMetric.Members:
      return analytics ? analytics.members_active : null;
    default:
      return null;
  }
}
