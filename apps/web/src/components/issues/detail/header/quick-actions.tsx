"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy02Icon,
  Delete02Icon,
  Link01Icon,
  MoreHorizontalIcon,
  Notification01Icon,
} from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DuplicateAndEditDialog } from "@/components/board/story/duplicate-and-edit-dialog";
import { useDeleteWorkItemStore } from "@/store/ui/delete-work-item.store";
import { useStorySubscription, useToggleStorySubscription } from "@/hooks/story/use-story-detail";
import { copyIssueLink, copyStoryId } from "@/lib/issues/issue-actions";
import type { IStory } from "@/types";

import { IssueDetailNav } from "./issue-detail-nav";

/** Plane-style header actions: prev/next · subscribe · copy · ⋯ */
export function IssueDetailQuickActions({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  nav,
  onNavigate,
  onDeleted,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  nav?: {
    position: number;
    total: number;
    prevId: string | null;
    nextId: string | null;
  };
  onNavigate?: (storyId: string) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { data: sub } = useStorySubscription(workspaceSlug, projectId, story.id);
  const toggleSub = useToggleStorySubscription(workspaceSlug, projectId, story.id);
  const openDelete = useDeleteWorkItemStore((s) => s.open);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const handleDelete = () => {
    openDelete({
      story,
      workspaceSlug,
      projectId,
      cycleId,
      onDeleted: () => {
        onDeleted?.();
        router.push(`/${workspaceSlug}/projects/${projectId}/issues`);
      },
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {nav && onNavigate ? (
        <>
          <IssueDetailNav
            position={nav.position}
            total={nav.total}
            prevId={nav.prevId}
            nextId={nav.nextId}
            onNavigate={onNavigate}
          />
          <span className="mx-0.5 h-4 w-px bg-border/70" aria-hidden />
        </>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs active:scale-[0.97]"
        onClick={() => toggleSub.mutate(Boolean(sub?.subscribed))}
      >
        <HugeiconsIcon icon={Notification01Icon} className="size-4" />
        {sub?.subscribed ? "Subscribed" : "Subscribe"}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy link"
        className="active:scale-[0.97]"
        onClick={() => void copyIssueLink(workspaceSlug, story)}
      >
        <HugeiconsIcon icon={Link01Icon} className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More options" className="active:scale-[0.97]">
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDuplicateOpen(true)}>
            <HugeiconsIcon icon={Copy02Icon} className="size-4" />
            Duplicate and edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyStoryId(story)}>
            <HugeiconsIcon icon={Copy02Icon} className="size-4" />
            Copy work item ID
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={handleDelete}>
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {duplicateOpen ? (
        <DuplicateAndEditDialog
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open
          onOpenChange={setDuplicateOpen}
        />
      ) : null}
    </div>
  );
}
