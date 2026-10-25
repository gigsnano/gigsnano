"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Edit02Icon,
  FlagIcon,
  UserAdd01Icon,
  UserRemove01Icon,
  Copy01Icon,
  Link01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";

import { useAuthUser } from "@/hooks/auth/use-auth";
import { useAssignStory, useStory, useUpdateStory } from "@/hooks/story/use-stories";
import { useDeleteWorkItemStore } from "@/store/ui/delete-work-item.store";
import { STORY_PRIORITY_ORDER, STORY_PRIORITY_META, STORY_STATUS_ORDER, STORY_STATUS_META } from "@/constants/story-meta";
import type { CommandPageKey } from "@/lib/nav/command-registry";
import { CommandGroup, CommandItem } from "@/components/ui/command";

interface ContextualActionsProps {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  page: CommandPageKey | null;
  setPage: (page: CommandPageKey | null) => void;
  go: (href: string) => void;
  closePalette: () => void;
}

/** Work-item-scoped commands, shown first while on an issue route (mirrors
 * Plane's `shouldShowContextBasedActions`). Owns all story-mutation calls for
 * the palette so `workspace-search.tsx` stays mutation-free. All story hooks
 * are called unconditionally at the top — the picker sub-pages (`page`) only
 * change what's rendered, never which hooks run. */
export function ContextualActions({
  workspaceSlug,
  projectId,
  storyId,
  page,
  setPage,
  go,
  closePalette,
}: ContextualActionsProps) {
  const { data: story } = useStory(workspaceSlug, projectId, storyId);
  const { data: user } = useAuthUser();
  const updateStory = useUpdateStory(workspaceSlug, projectId);
  const assignStory = useAssignStory(workspaceSlug, projectId);
  const openDelete = useDeleteWorkItemStore((s) => s.open);

  if (page === "update-work-item-state") {
    return (
      <CommandGroup heading="Change state">
        {STORY_STATUS_ORDER.map((status) => (
          <CommandItem
            key={status}
            value={`state ${STORY_STATUS_META[status].label}`}
            onSelect={() => {
              updateStory.mutate({ storyId, patch: { status } });
              closePalette();
            }}
          >
            <HugeiconsIcon icon={STORY_STATUS_META[status].icon} />
            <span>{STORY_STATUS_META[status].label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }

  if (page === "update-work-item-priority") {
    return (
      <CommandGroup heading="Change priority">
        {STORY_PRIORITY_ORDER.map((priority) => (
          <CommandItem
            key={priority}
            value={`priority ${STORY_PRIORITY_META[priority].label}`}
            onSelect={() => {
              updateStory.mutate({ storyId, patch: { priority } });
              closePalette();
            }}
          >
            <HugeiconsIcon icon={FlagIcon} />
            <span>{STORY_PRIORITY_META[priority].label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }

  return (
    <CommandGroup heading="Work item">
      <CommandItem value="change state" onSelect={() => setPage("update-work-item-state")}>
        <HugeiconsIcon icon={Edit02Icon} />
        <span>Change state</span>
      </CommandItem>
      <CommandItem value="change priority" onSelect={() => setPage("update-work-item-priority")}>
        <HugeiconsIcon icon={FlagIcon} />
        <span>Change priority</span>
      </CommandItem>
      <CommandItem
        value="assign to me"
        onSelect={() => {
          // Guard: if the auth user hasn't resolved yet, do nothing rather than
          // silently unassigning via a null fallback.
          if (user?.id) assignStory.mutate({ storyId, assigneeId: user.id });
          closePalette();
        }}
      >
        <HugeiconsIcon icon={UserAdd01Icon} />
        <span>Assign to me</span>
      </CommandItem>
      <CommandItem
        value="unassign"
        onSelect={() => {
          assignStory.mutate({ storyId, assigneeId: null });
          closePalette();
        }}
      >
        <HugeiconsIcon icon={UserRemove01Icon} />
        <span>Unassign</span>
      </CommandItem>
      <CommandItem
        value="copy id"
        onSelect={() => {
          navigator.clipboard.writeText(story?.code ?? "").catch(() => {});
          closePalette();
        }}
      >
        <HugeiconsIcon icon={Copy01Icon} />
        <span>Copy ID</span>
      </CommandItem>
      <CommandItem
        value="copy url"
        onSelect={() => {
          navigator.clipboard.writeText(window.location.href).catch(() => {});
          closePalette();
        }}
      >
        <HugeiconsIcon icon={Link01Icon} />
        <span>Copy URL</span>
      </CommandItem>
      {story ? (
        <CommandItem
          value="delete"
          onSelect={() => {
            openDelete({
              story,
              workspaceSlug,
              projectId,
              cycleId: story.cycle_id ?? undefined,
              onDeleted: () => go(`/${workspaceSlug}/projects/${projectId}/issues`),
            });
            closePalette();
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} />
          <span>Delete</span>
        </CommandItem>
      ) : null}
    </CommandGroup>
  );
}
