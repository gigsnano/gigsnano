"use client";

import { KanbanBoard } from "@/components/board";
import { useCycle } from "@/hooks/project/use-cycles";
import type { IIssuesData } from "@/hooks/issues/use-issues-data";

/** Kanban view — reuses the shared board (status columns + DnD + story panel). */
export function IssuesKanbanView({
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
  const cycle = useCycle(workspaceSlug, projectId, cycleId ?? "");
  const enableAgentChat =
    data.stories.some((s) => s.bmad !== null) || cycle.data?.is_sprint_zero === true;

  return (
    <div className="t-view-swap h-full min-h-0">
      <KanbanBoard
        stories={data.stories}
        isPending={data.isPending}
        isError={data.isError}
        refetch={data.refetch}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        enableAgentChat={enableAgentChat}
        showAssigneeFilter={false}
        cardVariant="work-item"
        projectIdentifier={data.project?.identifier ?? ""}
        emptyTitle="No work items"
        emptyDescription="Add a work item or adjust your filters to see items here."
      />
    </div>
  );
}
