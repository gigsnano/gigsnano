"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";

import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { RELATION_TYPE_LABEL } from "@/constants/story-relation-meta";
import { useDeleteStoryRelation, useStoryRelations } from "@/hooks/story/use-story-detail";
import { cn } from "@/lib/utils";

export function IssueRelations({
  storyId,
  workspaceSlug,
  projectId,
  onOpenStory,
  onAdd,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
  onOpenStory?: (id: string) => void;
  onAdd?: () => void;
}) {
  const { data: relations } = useStoryRelations(workspaceSlug, projectId, storyId);
  const deleteRelation = useDeleteStoryRelation(workspaceSlug, projectId, storyId);
  const count = relations?.length ?? 0;

  if (count === 0) return null;

  return (
    <IssueCollapsibleSection
      title="Relations"
      count={count}
      defaultOpen
      action={
        onAdd ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add relation"
            className="size-7 active:scale-[0.97]"
            onClick={onAdd}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </Button>
        ) : null
      }
    >
      <ul className="space-y-0.5">
        {(relations ?? []).map((rel) => (
          <li
            key={rel.id}
            className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
          >
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs text-muted-foreground">
              {RELATION_TYPE_LABEL[rel.relation_type]}
            </span>
            <button
              type="button"
              onClick={() => onOpenStory?.(rel.related_story_id)}
              className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:underline"
            >
              {rel.related_story_key} · {rel.related_story_title}
            </button>
            <button
              type="button"
              aria-label="Remove relation"
              onClick={() => deleteRelation.mutate(rel.id)}
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
