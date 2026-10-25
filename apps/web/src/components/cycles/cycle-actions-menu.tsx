"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, PencilEdit02Icon, Link01Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { CreateCycleDialog } from "@/components/cycles/create-cycle-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteCycle } from "@/hooks/project/use-cycles";
import type { ICycle } from "@/types";

export function CycleActionsMenu({
  cycle,
  workspaceSlug,
  projectId,
}: {
  cycle: ICycle;
  workspaceSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useDeleteCycle(workspaceSlug, projectId);

  const copyLink = () => {
    const url = `${window.location.origin}/${workspaceSlug}/projects/${projectId}/cycles/${cycle.id}`;
    void navigator.clipboard?.writeText(url);
  };

  const onDelete = async () => {
    await remove.mutateAsync(cycle.id);
    setDeleteOpen(false);
    // If we're on this cycle's detail page, go back to the list. Read the URL
    // in the handler so the menu doesn't re-render on every route change.
    if (window.location.pathname.includes(`/cycles/${cycle.id}`)) {
      router.push(`/${workspaceSlug}/projects/${projectId}/cycles`);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cycle options"
            onClick={(e) => e.stopPropagation()}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
            Edit cycle
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyLink}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive">
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete cycle
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateCycleDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycle={cycle}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete cycle?</DialogTitle>
          <DialogDescription>
            This will permanently remove{" "}
            <span className="font-medium text-foreground">{cycle.name}</span>. Its work items are
            kept but moved out of the cycle. This action cannot be undone.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={onDelete}
            >
              {remove.isPending ? "Deleting…" : "Delete cycle"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
