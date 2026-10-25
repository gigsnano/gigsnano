"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, FilterIcon, PreferenceHorizontalIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CreateWorkItemModal } from "@/components/board";
import { useIssuesData } from "@/hooks/issues/use-issues-data";
import { countActiveFilters, useIssuesViewStore } from "@/store/ui/issues-view.store";
import { IssuesViewSwitcher } from "../issues-view-switcher";
import { IssuesFilterPopover } from "../filters/issues-filter-popover";
import { IssuesDisplayPopover } from "../filters/issues-display-popover";
import { SpreadsheetColumnsMenu } from "../views/spreadsheet/spreadsheet-columns-menu";

/**
 * The control cluster both Work Items and Cycle detail render: count · view
 * switcher · Filter · Columns · Display · Add.
 *
 * It exists because the two toolbars had drifted — the cycle counted
 * `filterStories(...).length` while /issues counted the rendered rows, so the
 * cycle badge disagreed with the rows beneath it. One component, one count.
 */
export function IssuesToolbarControls({
  workspaceSlug,
  projectId,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const filters = useIssuesViewStore((s) => s.filters);
  const gigsqlQuery = useIssuesViewStore((s) => s.gigsqlQuery);
  const layout = useIssuesViewStore((s) => s.layout);
  const activeFilters = countActiveFilters(filters) || (gigsqlQuery.trim() ? 1 : 0);

  // Matches, not rows. `tree.all` is every item the filter matched, so switching
  // List → Kanban changes the arrangement and never the number. Calendar is the
  // exception: it is server-paginated, so its own total is the honest one there.
  const data = useIssuesData(workspaceSlug, projectId, cycleId);
  const count = data.pagination ? data.pagination.total : data.tree.all.length;

  return (
    <>
      {count > 0 ? (
        <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground @min-[40rem]/hdr:inline">
          {count}
        </span>
      ) : null}

      <IssuesViewSwitcher />

      <IssuesFilterPopover
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        trigger={
          <Button variant="ghost" size="sm" className={cn(activeFilters > 0 && "text-foreground")}>
            <HugeiconsIcon icon={FilterIcon} className="size-4" />
            <span className="hidden @min-[52rem]/hdr:inline">Filter</span>
            {activeFilters > 0 ? (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">
                {activeFilters}
              </span>
            ) : null}
          </Button>
        }
      />

      {layout === "spreadsheet" ? <SpreadsheetColumnsMenu /> : null}

      <IssuesDisplayPopover
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        trigger={
          <Button variant="ghost" size="sm">
            <HugeiconsIcon icon={PreferenceHorizontalIcon} className="size-4" />
            <span className="hidden @min-[52rem]/hdr:inline">Display</span>
          </Button>
        }
      />

      <CreateWorkItemModal workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId}>
        <Button size="sm">
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          <span className="hidden @min-[46rem]/hdr:inline">Add work item</span>
        </Button>
      </CreateWorkItemModal>
    </>
  );
}
