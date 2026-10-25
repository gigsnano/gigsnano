"use client";

import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { spreadsheetRows } from "@/lib/issues/spreadsheet-rows";
import type { IIssuesData } from "@/hooks/issues/use-issues-data";

import { SpreadsheetHeader, type ISpreadsheetFilterOptions } from "./spreadsheet-header";
import { SpreadsheetRow } from "./spreadsheet-row";
import type { ISpreadsheetCellCtx } from "./spreadsheet-cell";

/** Spreadsheet view — Plane-parity dense table with sortable, toggleable columns. */
export function SpreadsheetView({
  workspaceSlug,
  projectId,
  data,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  data: IIssuesData;
  cycleId?: string;
}) {
  const allColumns = useIssuesViewStore((s) => s.spreadsheetColumns);
  const sort = useIssuesViewStore((s) => s.sort);

  const columns = allColumns.filter((c) => c.visible);
  // Which items exist was decided in `buildIssueTree`; this only orders them.
  const rows = spreadsheetRows(data.stories, sort, data.sortCtx);
  const identifier = data.project?.identifier ?? "";
  const ctx: ISpreadsheetCellCtx = {
    workspaceSlug,
    projectId,
    cycleId,
    assignees: data.assignees,
    sortCtx: data.sortCtx,
  };

  const filterOptions: ISpreadsheetFilterOptions = {
    assigneeOptions: [...data.assignees.values()].map((a) => ({
      value: a.user_id,
      label: a.display_name,
    })),
    labelOptions: [...data.labels.values()].map((l) => ({
      value: l.id,
      label: l.name,
      icon: (
        <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
      ),
    })),
  };

  return (
    <div className="gn-sheet-scroll t-view-swap h-full min-w-0">
      <table className="border-collapse text-sm">
        <SpreadsheetHeader columns={columns} filterOptions={filterOptions} />
        <tbody>
          {rows.map((story) => (
            <SpreadsheetRow
              key={story.id}
              story={story}
              childrenById={data.tree.childrenById}
              columns={columns}
              ctx={ctx}
              identifier={identifier}
            />
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No work items match your filters.
        </div>
      ) : null}
    </div>
  );
}
