"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { countActiveFilters, useIssuesViewStore } from "@/store/ui/issues-view.store";
import { useIssuesData } from "@/hooks/issues/use-issues-data";
import { useIssuesUrlState } from "@/hooks/issues/use-issues-url-state";
import { FilterPills } from "./filters/filter-pills";
import { IssuesListView } from "./views/issues-list-view";
import { IssuesKanbanView } from "./views/issues-kanban-view";
import { IssuesCalendarView } from "./views/issues-calendar-view";
import { SpreadsheetView } from "./views/spreadsheet/spreadsheet-view";
import { IssuesGanttView } from "./views/issues-gantt-view";
import { DhtmlxGanttView } from "./views/gantt/dhtmlx-gantt-view";
import { DHTMLX_GANTT_ENABLED } from "@/lib/gantt/gantt-flag";
import { IssuesGraphView } from "./views/issues-graph-view";

/** The Work Items page body — renders the layout selected in the toolbar. */
export function IssuesView({
  workspaceSlug,
  projectId,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const layout = useIssuesViewStore((s) => s.layout);
  const filters = useIssuesViewStore((s) => s.filters);
  const gigsqlQuery = useIssuesViewStore((s) => s.gigsqlQuery);
  const clearFilters = useIssuesViewStore((s) => s.clearFilters);
  const data = useIssuesData(workspaceSlug, projectId, cycleId);
  const router = useRouter();
  const searchParams = useSearchParams();

  useIssuesUrlState();

  // Legacy deep-link: ?openStory=… → the peek sheet.
  const openStoryId = searchParams.get("openStory");
  useEffect(() => {
    if (!openStoryId) return;
    router.replace(`?peek=${openStoryId}`, { scroll: false });
  }, [openStoryId, router]);

  if (data.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (data.isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load work items"
          description="Something went wrong fetching this project's work items."
          actions={[{ label: "Retry", onClick: () => data.refetch() }]}
        />
      </div>
    );
  }

  const hasActiveFilters =
    countActiveFilters(filters) > 0 || Boolean(gigsqlQuery.trim());
  const filterEmpty =
    hasActiveFilters &&
    (data.filteredTotal === 0 ||
      (data.filteredTotal === null && data.tree.all.length === 0));
  // Calendar used to be excluded here: its `pagination.total` counted the
  // VISIBLE MONTH, so a quiet month read as "this project has no work items"
  // and swapped the grid for a create-your-first-item prompt — taking the month
  // arrows with it, so there was no way back to a month that did have work.
  // Since the calendar became a full-fetch layout that total is the project's,
  // like everywhere else, and `tree.all.length === 0` now means what it says.
  const projectEmpty =
    !hasActiveFilters &&
    data.tree.all.length === 0 &&
    (data.pagination?.total ?? 0) === 0;

  if (filterEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FilterPills />
        <div className="p-6">
          <EmptyState
            assetKey="board"
            title="No work items match your filters"
            description="Try adjusting or clearing your filters to see more work items."
            actions={[{ label: "Clear filters", onClick: clearFilters }]}
          />
        </div>
      </div>
    );
  }

  if (projectEmpty) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="board"
          title="No work items yet"
          description={
            cycleId
              ? "No work items in this cycle yet."
              : "Create your first work item to get started."
          }
        />
      </div>
    );
  }

  const props = { workspaceSlug, projectId, data, cycleId };

  let body: React.ReactNode;
  switch (layout) {
    case "kanban":
      body = <IssuesKanbanView {...props} />;
      break;
    case "calendar":
      body = <IssuesCalendarView {...props} />;
      break;
    case "spreadsheet":
      body = <SpreadsheetView {...props} />;
      break;
    case "gantt":
      // GIN-349: the dhtmlx-gantt foundation ships behind a flag alongside the
      // existing custom Gantt; the later phases (GIN-350..353) build on it.
      body = DHTMLX_GANTT_ENABLED ? <DhtmlxGanttView {...props} /> : <IssuesGanttView {...props} />;
      break;
    case "graph":
      body = <IssuesGraphView {...props} />;
      break;
    case "list":
    default:
      body = <IssuesListView {...props} />;
  }

  // Kanban/gantt need overflow-hidden so column rails fill the viewport and
  // scroll internally (Plane). List/calendar/spreadsheet keep page scroll.
  const boardLayouts = layout === "kanban" || layout === "gantt" || layout === "graph";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterPills />
      <div className={boardLayouts ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-auto"}>
        {body}
      </div>
      {/* No layout paginates now — calendar was the last one, and it joined the
          full-fetch path so a date basis could be chosen client-side. Kept
          because `pagination` is still non-null for any future paged layout. */}
      {data.pagination && data.pagination.total > data.pagination.limit ? (
        <div className="shrink-0 border-t bg-background px-4 py-2">
          <OffsetPagination
            offset={data.pagination.offset}
            limit={data.pagination.limit}
            total={data.pagination.total}
            onOffsetChange={data.pagination.setOffset}
          />
        </div>
      ) : null}
    </div>
  );
}
