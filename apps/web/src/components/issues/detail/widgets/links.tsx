"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Copy02Icon, Delete02Icon, Link01Icon } from "@hugeicons/core-free-icons";

import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { useDeleteStoryLink, useStoryLinks } from "@/hooks/story/use-story-detail";
import { cn } from "@/lib/utils";

export function IssueLinks({
  storyId,
  workspaceSlug,
  projectId,
  onAdd,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
  onAdd?: () => void;
}) {
  const { data: links } = useStoryLinks(workspaceSlug, projectId, storyId);
  const deleteLink = useDeleteStoryLink(workspaceSlug, projectId, storyId);
  const count = links?.length ?? 0;

  if (count === 0) return null;

  return (
    <IssueCollapsibleSection
      title="Links"
      count={count}
      defaultOpen
      action={
        onAdd ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add link"
            className="size-7 active:scale-[0.97]"
            onClick={onAdd}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </Button>
        ) : null
      }
    >
      <ul className="space-y-0.5">
        {(links ?? []).map((link) => (
          <li
            key={link.id}
            className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
          >
            <HugeiconsIcon icon={Link01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
            >
              {link.title}
            </a>
            <button
              type="button"
              aria-label="Copy link"
              onClick={() => void navigator.clipboard?.writeText(link.url)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 active:scale-[0.97]",
              )}
            >
              <HugeiconsIcon icon={Copy02Icon} className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete link"
              onClick={() => deleteLink.mutate(link.id)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 active:scale-[0.97]",
              )}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </IssueCollapsibleSection>
  );
}
