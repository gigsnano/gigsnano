"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, Link01Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeletePage } from "@/hooks/docs/use-pages";
import type { IPage } from "@/types";

/** Per-page overflow menu (copy link / delete). Mounted from both the pages list
 *  row and the page detail header so delete lives in exactly one component. */
export function PageActionsMenu({
  page,
  workspaceSlug,
  projectId,
}: {
  page: Pick<IPage, "id" | "title">;
  workspaceSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useDeletePage(workspaceSlug, projectId);
  const base = `/${workspaceSlug}/projects/${projectId}/pages`;

  const copyLink = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}${base}/${page.id}`);
  };

  // `mutate`, not `mutateAsync`: a failed delete must surface in the dialog, not
  // reject unhandled out of the click handler.
  const onDelete = () => {
    remove.mutate(page.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        // Read the URL in the handler so the menu doesn't re-render on route changes.
        if (window.location.pathname.includes(`/pages/${page.id}`)) router.push(base);
      },
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Options for ${page.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={copyLink}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive">
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete page
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete page?</DialogTitle>
          <DialogDescription>
            This will permanently remove{" "}
            <span className="font-medium text-foreground">{page.title}</span> and its content. This
            action cannot be undone.
          </DialogDescription>
          {remove.isError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Couldn&apos;t delete this page. Try again.
            </p>
          ) : null}
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
              {remove.isPending ? "Deleting…" : "Delete page"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
