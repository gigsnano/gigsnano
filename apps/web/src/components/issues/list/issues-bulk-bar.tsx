"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDeleteStory } from "@/hooks/story/use-stories";
import { EDeleteCascade } from "@/types";
import {
  isSelectionActive,
  useIssuesSelectionStore,
} from "@/store/ui/issues-selection.store";

/** Bottom bar when one or more list rows are selected. */
export function IssuesBulkBar({
  workspaceSlug,
  projectId,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const selectedIds = useIssuesSelectionStore((s) => s.selectedIds);
  const clear = useIssuesSelectionStore((s) => s.clear);
  const deleteStory = useDeleteStory(workspaceSlug, projectId, cycleId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cascadeChildren, setCascadeChildren] = useState(false);

  const active = isSelectionActive({ selectedIds });
  if (!active) return null;

  const count = selectedIds.length;

  const handleDelete = async () => {
    const cascade = cascadeChildren ? EDeleteCascade.Children : undefined;
    await Promise.all(selectedIds.map((id) => deleteStory.mutateAsync({ storyId: id, cascade })));
    clear();
    setConfirmDelete(false);
  };

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4",
          "animate-in slide-in-from-bottom-4 fade-in duration-250 ease-out motion-reduce:animate-none",
        )}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm font-medium tabular-nums">
            {count} selected
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clear}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            Clear
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setConfirmDelete(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {count} work items to Trash?</DialogTitle>
            <DialogDescription>
              The selected work items will be moved to the workspace trash. You can restore them
              later.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-1 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left">
            <Checkbox
              checked={cascadeChildren}
              onCheckedChange={(v) => setCascadeChildren(v === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">Move sub-items too</span>
              <span className="text-xs text-muted-foreground">
                Also trash every sub-item of the selected items. Otherwise sub-items stay, detached.
              </span>
            </span>
          </label>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteStory.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteStory.isPending ? "Moving…" : "Move to Trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
