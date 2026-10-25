"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy02Icon,
  Delete02Icon,
  Link01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  Archive02Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkItemModal } from "@/components/board/story/create-work-item-modal";
import { DuplicateAndEditDialog } from "@/components/board/story/duplicate-and-edit-dialog";
import { useCreateStory } from "@/hooks/story/use-stories";
import { useDeleteWorkItemStore } from "@/store/ui/delete-work-item.store";
import {
  copyIssueLink,
  issueCopyPayload,
  openIssueInNewTab,
} from "@/lib/issues/issue-actions";
import { peekHref } from "@/lib/issues/issue-routes";
import { storyTypeOf } from "@/lib/issues/story-type";
import { canHaveChildren, childTypesOf, defaultChildType } from "@/lib/issues/story-hierarchy";
import type { IStory } from "@/types";

/** Plane-style ⋯ menu for list rows. */
export function IssueRowActions({
  story,
  workspaceSlug,
  projectId,
  cycleId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const createStory = useCreateStory(workspaceSlug, projectId, cycleId);
  const openDelete = useDeleteWorkItemStore((s) => s.open);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const handleCopy = () => {
    createStory.mutate(issueCopyPayload(story));
  };

  // Leaf types (Task/Bug) can't parent anything — hide the action rather than
  // offer a create flow the hierarchy would reject (GIN-317).
  const parentType = storyTypeOf(story);
  const eligibleForChild = canHaveChildren(parentType);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Row actions"
            className="relative z-10 size-7 opacity-0 transition-opacity duration-150 group-hover:opacity-100 data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link href={peekHref(story)} scroll={false}>
              <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
              Edit
            </Link>
          </DropdownMenuItem>
          {eligibleForChild ? (
            <DropdownMenuItem onSelect={() => setAddChildOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              Add child item
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDuplicateOpen(true)}>
            <HugeiconsIcon icon={Copy02Icon} className="size-4" />
            Duplicate and edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleCopy} disabled={createStory.isPending}>
            <HugeiconsIcon icon={Copy02Icon} className="size-4" />
            Make a copy
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openIssueInNewTab(workspaceSlug, story)}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
            Open in new tab
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyIssueLink(workspaceSlug, story)}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Archive is not available yet">
            <HugeiconsIcon icon={Archive02Icon} className="size-4" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => openDelete({ story, workspaceSlug, projectId, cycleId })}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Child creation reuses the standard create modal in child mode: parent
          pre-filled and immutable-by-id, project inherited, type seeded to the
          parent's first valid child type (GIN-317). Mounted only while open so a
          long list doesn't spin up one data-fetching modal per row. */}
      {addChildOpen ? (
        <CreateWorkItemModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={story.cycle_id ?? cycleId}
          open
          onOpenChange={setAddChildOpen}
          defaultParentId={story.id}
          childTypes={childTypesOf(parentType)}
          initialDraft={{ type: defaultChildType(parentType) ?? undefined }}
        />
      ) : null}

      {duplicateOpen ? (
        <DuplicateAndEditDialog
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open
          onOpenChange={setDuplicateOpen}
        />
      ) : null}
    </>
  );
}
