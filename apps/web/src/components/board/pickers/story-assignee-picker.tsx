"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { useMembers } from "@/hooks/workspace/use-members";
import { useAssignStory } from "@/hooks/story/use-stories";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import { EMemberStatus, type IStory } from "@/types";

export function StoryAssigneePicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  hideLabel = false,
  fullWidth = false,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  hideLabel?: boolean;
  fullWidth?: boolean;
}) {
  // Assignment is workspace-scoped on the backend (any active workspace member
  // can be assigned, even one not yet added to this project), so the candidate
  // pool is the workspace's members — not just this project's.
  const { data: members } = useMembers(workspaceSlug);
  const assign = useAssignStory(workspaceSlug, projectId, cycleId);
  const [query, setQuery] = useState("");

  const active = (members ?? []).filter((m) => m.status === EMemberStatus.Active);
  const current = active.find((m) => m.user_id === story.assignee_id);

  const q = query.trim().toLowerCase();
  const filtered = !q
    ? active
    : active.filter(
        (m) =>
          m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );

  return (
    <div className={cn("flex items-center gap-2", fullWidth && "w-full")}>
      {!hideLabel ? (
        <span className="text-xs font-medium text-muted-foreground">Assignee</span>
      ) : null}
      <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
        <DropdownMenuTrigger
          aria-label={current ? `Assignee: ${current.display_name}` : "Add assignees"}
          className={cn(propertyTrigger, current && "text-foreground", fullWidth && "w-full")}
        >
          {current ? (
            <>
              <Avatar name={current.display_name} src={current.avatar_url} size="xs" />
              <span className="max-w-[8rem] truncate">{current.display_name}</span>
            </>
          ) : (
            <>
              <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5" />
              <span>Add assignees</span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-0">
          {/* Search — stopPropagation keeps Radix's menu typeahead from stealing keystrokes. */}
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search members…"
              aria-label="Search members to assign"
              className="h-5 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-56 overflow-y-auto p-1">
            {active.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No workspace members yet.
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No members match.</div>
            ) : (
              filtered.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  disabled={assign.isPending}
                  onSelect={() => assign.mutate({ storyId: story.id, assigneeId: m.user_id })}
                >
                  <Avatar name={m.display_name} src={m.avatar_url} size="sm" />
                  <span className="flex-1 truncate">{m.display_name}</span>
                  {story.assignee_id === m.user_id ? (
                    <span className="text-xs text-muted-foreground">Assigned</span>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}

            {story.assignee_id ? (
              <DropdownMenuItem
                disabled={assign.isPending}
                onSelect={() => assign.mutate({ storyId: story.id, assigneeId: null })}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
                Clear assignee
              </DropdownMenuItem>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
