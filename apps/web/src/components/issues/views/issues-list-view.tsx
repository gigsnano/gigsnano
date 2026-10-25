"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { groupStories } from "@/lib/issues/issues-grouping";
import { visibleListRowIds } from "@/lib/issues/issue-tree";
import { computeSortOrder, groupFieldPatch } from "@/lib/issues/sort-order";
import { canLinkAsChild } from "@/lib/issues/parent-link";
import { useReorderStory, useUpdateStory } from "@/hooks/story/use-stories";
import { useCustomFields } from "@/hooks/project/use-project-settings";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { IIssuesData } from "@/hooks/issues/use-issues-data";
import type { Instruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { groupMeta } from "../shared/group-header";
import { IssueListRowRoot } from "../list/issue-list-row-root";
import { IssuesBulkBar } from "../list/issues-bulk-bar";

/** Grouped List view (Plane-style): collapsible groups + parent/child hierarchy. */
export function IssuesListView({
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
  const groupBy = useIssuesViewStore((s) => s.groupBy);
  const sort = useIssuesViewStore((s) => s.sort);
  const expandedIssueIds = useIssuesViewStore((s) => s.expandedIssueIds);
  const { stories, tree, project, assignees, agents, labels, sortCtx } = data;
  const reorder = useReorderStory(workspaceSlug, projectId, cycleId);
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);
  const customFields = useCustomFields(workspaceSlug, projectId);
  const [linkConfirm, setLinkConfirm] = useState<{ sourceId: string; targetId: string } | null>(null);

  const cfId = typeof groupBy === "string" && groupBy.startsWith("cf:") ? groupBy.slice(3) : null;
  const cfOptions = cfId ? (customFields.data?.find((f) => f.id === cfId)?.options ?? undefined) : undefined;

  // No root filter here: which items exist is decided once, in `buildIssueTree`,
  // so this list and the board can't disagree about how many a filter matched.
  const groups = groupStories(stories, groupBy, sort, cfOptions, sortCtx);
  const orderedIds = visibleListRowIds(groups, tree.childrenById, expandedIssueIds, sort, sortCtx);

  const visible = groups.filter(
    (g) => g.stories.length > 0 || groupBy === "status" || groupBy === "priority",
  );

  const identifier = project?.identifier ?? "";
  // Dragging is what Manual *is*. Under any sort the rows would snap back the
  // moment they re-sorted, so the handle goes away rather than lying.
  const dragEnabled = sort.length === 0;
  const orderById = new Map(stories.map((s) => [s.id, s.order]));

  const handleRowDrop = ({
    sourceId,
    targetId,
    groupKey,
    instruction,
  }: {
    sourceId: string;
    targetId: string;
    groupKey: string;
    instruction: Instruction;
  }) => {
    // Dropping onto a row (combine) links the dragged item as a child — confirm
    // with the user before changing the tree (GIN-80). Invalid targets no-op, so
    // the dragged row simply returns to its place.
    if (instruction.operation === "combine") {
      if (canLinkAsChild(sourceId, targetId, stories)) {
        setLinkConfirm({ sourceId, targetId });
      }
      return;
    }

    const destGroup = groups.find((g) => g.key === groupKey);
    if (!destGroup) return;
    const destIds = destGroup.stories.reduce<string[]>((ids, s) => {
      if (s.id !== sourceId) ids.push(s.id);
      return ids;
    }, []);
    let index = destIds.indexOf(targetId);
    if (index === -1) index = destIds.length;
    else if (instruction.operation === "reorder-after") index += 1;

    const order = computeSortOrder(destIds, index, (id) => orderById.get(id) ?? 0);
    // Note: dragging into a different `cf:*` group (custom SELECT field) only
    // reorders — groupFieldPatch returns {} for cf groups, so the story's
    // custom field value is NOT reassigned. Follow-up slice.
    reorder.mutate({
      storyId: sourceId,
      patch: { order, ...groupFieldPatch(groupBy, groupKey) },
    });
  };

  return (
    <>
      <div className="t-view-swap @container/rows flex flex-col">
      {visible.map((group) => {
        const meta = groupMeta(groupBy, group.key, assignees, agents);
        return (
          <section key={group.key}>
            <header className="sticky top-0 z-[1] flex items-center gap-2 border-b bg-background/80 px-4 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <span className="flex size-4 items-center justify-center">{meta.icon}</span>
              <span className="text-13 font-medium text-foreground">{meta.label}</span>
              <span className="rounded-full bg-muted px-1.5 text-13 tabular-nums text-muted-foreground">
                {group.stories.length}
              </span>
            </header>

            {group.stories.map((story) => (
              <IssueListRowRoot
                key={story.id}
                story={story}
                childrenById={tree.childrenById}
                sortCtx={sortCtx}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                cycleId={cycleId}
                identifier={identifier}
                labels={labels}
                sort={sort}
                orderedIds={orderedIds}
                groupKey={group.key}
                dragEnabled={dragEnabled}
                onRowDrop={handleRowDrop}
              />
            ))}

            {group.stories.length === 0 ? (
              <div className={cn("px-4 py-2 text-xs text-muted-foreground")}>No work items</div>
            ) : null}
          </section>
        );
      })}
      </div>
      <IssuesBulkBar workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />

      <Dialog open={linkConfirm !== null} onOpenChange={(open) => !open && setLinkConfirm(null)}>
        <DialogContent>
          <DialogTitle>Link as sub-item?</DialogTitle>
          <DialogDescription>
            Link{" "}
            <span className="font-medium text-foreground">
              {stories.find((s) => s.id === linkConfirm?.sourceId)?.title ?? "this item"}
            </span>{" "}
            as a child of{" "}
            <span className="font-medium text-foreground">
              {stories.find((s) => s.id === linkConfirm?.targetId)?.title ?? "the parent"}
            </span>
            ?
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setLinkConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={updateStory.isPending}
              onClick={() => {
                if (linkConfirm) {
                  updateStory.mutate({
                    storyId: linkConfirm.sourceId,
                    patch: { parent_id: linkConfirm.targetId },
                  });
                }
                setLinkConfirm(null);
              }}
            >
              {updateStory.isPending ? "Linking…" : "Yes, link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
