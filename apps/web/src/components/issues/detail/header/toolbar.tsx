"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Cancel01Icon,
  Copy02Icon,
  Delete02Icon,
  Link01Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  ArrowExpandIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteWorkItemStore } from "@/store/ui/delete-work-item.store";
import { useStorySubscription, useToggleStorySubscription } from "@/hooks/story/use-story-detail";
import { copyIssueLink, copyStoryId } from "@/lib/issues/issue-actions";
import { issueDetailHref } from "@/lib/issues/issue-routes";
import type { IStory } from "@/types";
import Link from "next/link";

import { IssueDetailNav } from "./issue-detail-nav";

export function IssueDetailToolbar({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  variant,
  onClose,
  onBack,
  nav,
  onNavigate,
  navPlacement = "toolbar",
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  variant: "peek" | "page";
  onClose?: () => void;
  onBack?: () => void;
  nav?: {
    position: number;
    total: number;
    prevId: string | null;
    nextId: string | null;
  };
  onNavigate?: (storyId: string) => void;
  navPlacement?: "toolbar" | "header";
}) {
  const { data: sub } = useStorySubscription(workspaceSlug, projectId, story.id);
  const toggleSub = useToggleStorySubscription(workspaceSlug, projectId, story.id);
  const openDelete = useDeleteWorkItemStore((s) => s.open);

  const copyLink = () => {
    void copyIssueLink(workspaceSlug, story);
  };

  const copyId = () => {
    void copyStoryId(story);
  };

  const handleDelete = () => {
    openDelete({
      story,
      workspaceSlug,
      projectId,
      cycleId,
      onDeleted: () => onClose?.(),
    });
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
      <div className="flex items-center gap-0.5">
        {variant === "peek" && onBack ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1.5 text-muted-foreground transition-transform duration-150 ease-out hover:text-foreground active:scale-[0.97]"
            onClick={onBack}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            Back
          </Button>
        ) : null}
        {variant === "peek" && onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label="Close peek" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        ) : null}
        {variant === "peek" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Open full page" asChild>
            <Link href={issueDetailHref(workspaceSlug, story)}>
              <HugeiconsIcon icon={ArrowExpandIcon} className="size-4" />
            </Link>
          </Button>
        ) : null}
        {variant === "peek" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Copy link" onClick={copyLink}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        {nav && onNavigate ? (
          <>
            <div className={navPlacement === "header" ? "flex lg:hidden" : undefined}>
              <IssueDetailNav
                position={nav.position}
                total={nav.total}
                prevId={nav.prevId}
                nextId={nav.nextId}
                onNavigate={onNavigate}
              />
            </div>
            {navPlacement === "toolbar" ? (
              <span className="mx-0.5 h-4 w-px bg-border/70" aria-hidden />
            ) : null}
          </>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs active:scale-[0.97]"
          onClick={() =>
            toggleSub.mutate(Boolean(sub?.subscribed))
          }
        >
          <HugeiconsIcon icon={Notification01Icon} className="size-4" />
          {sub?.subscribed ? "Subscribed" : "Subscribe"}
        </Button>

        {variant === "page" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Copy link" onClick={copyLink}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More options">
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={copyId}>
              <HugeiconsIcon icon={Copy02Icon} className="size-4" />
              Copy work item ID
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onSelect={handleDelete}>
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
