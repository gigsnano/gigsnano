"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";

import { useWorkspaceStoriesPage } from "@/hooks/story/use-stories";
import { useProjects } from "@/hooks/project/use-projects";
import { useMembers } from "@/hooks/workspace/use-members";
import { useDashboardFilter } from "@/hooks/workspace/use-dashboard-filter";
import { STORY_STATUS_META, STORY_PRIORITY_META } from "@/constants/story-meta";
import {
  EStoryPriority,
  EStoryStatus,
  EWidgetGroupBy,
  type IStory,
  type IWidgetSettings,
  type IWorkspaceStoryFilters,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  filterStories,
  groupStories,
  withDashboardWindow,
} from "@/lib/dashboards/widget-filters";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

/**
 * GIN-48 / GIN-52 — Work-item list widget. Shows the widget's filtered work items
 * (status · title · priority), optionally grouped by a field, each linking to its
 * detail.
 */
export function StoryListBody({
  workspaceSlug,
  settings,
  query,
  emptyMessage = "No work items match this widget.",
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
  /** Server-side filters the list can't express client-side (e.g. `watching`). */
  query?: IWorkspaceStoryFilters;
  emptyMessage?: string;
}) {
  const dashboardFilter = useDashboardFilter();
  const { data, isPending, isError } = useWorkspaceStoriesPage(workspaceSlug, {
    limit: 100,
    ...query,
    project_ids: dashboardFilter?.project_ids,
  });
  const groupBy = settings?.group_by ?? EWidgetGroupBy.None;
  const { data: projects } = useProjects(workspaceSlug);
  const { data: members } = useMembers(workspaceSlug);

  if (isPending) return <WidgetSkeleton />;
  if (isError) return <WidgetMessage>Couldn&apos;t load work items.</WidgetMessage>;

  const filtered = filterStories(
    data?.items ?? [],
    withDashboardWindow(settings, dashboardFilter),
  );
  if (!filtered.length) return <WidgetMessage>{emptyMessage}</WidgetMessage>;

  const groupLabel = (key: string): string => {
    switch (groupBy) {
      case EWidgetGroupBy.Status:
        return STORY_STATUS_META[key as EStoryStatus]?.label ?? key;
      case EWidgetGroupBy.Priority:
        return STORY_PRIORITY_META[key as EStoryPriority]?.label ?? key;
      case EWidgetGroupBy.Project:
        return projects?.find((p) => p.id === key)?.name ?? "Project";
      case EWidgetGroupBy.Assignee:
        return key === "unassigned"
          ? "Unassigned"
          : (members?.find((m) => m.user_id === key)?.display_name ?? "Member");
      default:
        return key;
    }
  };

  const groups = groupStories(filtered, groupBy);
  const grouped = groupBy !== EWidgetGroupBy.None;

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key}>
          {grouped ? (
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <span className="truncate">{groupLabel(group.key)}</span>
              <span className="tabular-nums">{group.items.length}</span>
            </div>
          ) : null}
          <ul className="divide-y">
            {group.items.map((s) => (
              <StoryRow key={s.id} story={s} workspaceSlug={workspaceSlug} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StoryRow({ story: s, workspaceSlug }: { story: IStory; workspaceSlug: string }) {
  const status = STORY_STATUS_META[s.status];
  const priority = STORY_PRIORITY_META[s.priority];
  return (
    <li>
      <Link
        href={`/${workspaceSlug}/projects/${s.project_id}/issues/${s.id}`}
        className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50"
      >
        <HugeiconsIcon icon={status.icon} className={cn("size-3.5 shrink-0", status.color)} />
        <span className="min-w-0 flex-1 truncate">{s.title}</span>
        {s.priority !== EStoryPriority.None ? (
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
              priority.chip,
            )}
          >
            {priority.label}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
