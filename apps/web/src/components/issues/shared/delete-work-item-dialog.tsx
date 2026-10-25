"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteStory } from "@/hooks/story/use-stories";
import { cn } from "@/lib/utils";
import { EDeleteCascade } from "@/types";
import {
  useDeleteWorkItemStore,
  type IDeleteWorkItemTarget,
} from "@/store/ui/delete-work-item.store";

/** One shared confirm-delete dialog, driven imperatively via the store. Mounted
 * once in WorkspaceShell; every delete surface calls `open(...)`. When the item
 * has sub-items it offers the cascade choice (GIN-97); leaf items just confirm. */
export function DeleteWorkItemDialogHost() {
  const target = useDeleteWorkItemStore((s) => s.target);
  const close = useDeleteWorkItemStore((s) => s.close);

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed on the item so cascade choice + pending state reset per target. */}
        {target ? <DeleteWorkItemBody key={target.story.id} target={target} onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkItemBody({
  target,
  onClose,
}: {
  target: IDeleteWorkItemTarget;
  onClose: () => void;
}) {
  const { story, workspaceSlug, projectId, cycleId, onDeleted } = target;
  const deleteStory = useDeleteStory(workspaceSlug, projectId, cycleId);
  const childCount = story.sub_issue_count;
  const hasChildren = childCount > 0;
  const [cascade, setCascade] = useState<EDeleteCascade>(EDeleteCascade.Detach);

  const confirm = () => {
    deleteStory.mutate(
      { storyId: story.id, cascade: hasChildren ? cascade : undefined },
      {
        onSuccess: () => {
          onClose();
          onDeleted?.();
        },
      },
    );
  };

  const noun = childCount === 1 ? "sub-item" : "sub-items";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move to Trash?</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{story.title || "This work item"}</span> will
          be moved to the workspace trash. You can restore it later.
        </DialogDescription>
      </DialogHeader>

      {hasChildren ? (
        <div className="mt-1 grid gap-2" role="radiogroup" aria-label="Sub-item handling">
          <CascadeOption
            selected={cascade === EDeleteCascade.Detach}
            title="Keep sub-items"
            detail={`Its ${childCount} ${noun} stay, detached from this item.`}
            onSelect={() => setCascade(EDeleteCascade.Detach)}
          />
          <CascadeOption
            selected={cascade === EDeleteCascade.Children}
            title="Move sub-items too"
            detail={`This item and its ${childCount} ${noun} all go to Trash.`}
            onSelect={() => setCascade(EDeleteCascade.Children)}
          />
        </div>
      ) : null}

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={deleteStory.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={confirm}
          disabled={deleteStory.isPending}
        >
          {deleteStory.isPending ? "Moving…" : "Move to Trash"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CascadeOption({
  selected,
  title,
  detail,
  onSelect,
}: {
  selected: boolean;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 active:scale-[0.99]",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-foreground/20 hover:bg-muted/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
