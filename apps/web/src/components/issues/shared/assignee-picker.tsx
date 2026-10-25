"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon, Tick02Icon, Search01Icon } from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { agentAvatarFromStory } from "@/lib/issues/assignee-avatars";
import { useAssignStory } from "@/hooks/story/use-stories";
import { useMembers } from "@/hooks/workspace/use-members";
import { EMemberStatus, type IStory } from "@/types";

/** Compact inline assignee picker — avatar (or add glyph) is the trigger. */
export function AssigneePicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  className,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  className?: string;
}) {
  // Workspace-scoped assignment (see StoryAssigneePicker) — candidates are the
  // workspace's active members, searchable.
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
  // Sprint-0 cards (and manual stories with an ai_agent_id) carry a pinned,
  // non-removable AI agent shown before the human assignee picker.
  const agent = agentAvatarFromStory(story);

  const picker = (
    <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenuTrigger
        aria-label={current ? `Assignee: ${current.display_name}` : "Assign"}
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-transform active:scale-95",
          className,
        )}
      >
        {current ? (
          <Avatar name={current.display_name} src={current.avatar_url} size="xs" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full border border-dashed text-muted-foreground hover:border-solid hover:text-foreground">
            <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-0">
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
          {story.assignee_id ? (
            <DropdownMenuItem onSelect={() => assign.mutate({ storyId: story.id, assigneeId: null })}>
              <span className="flex size-5 items-center justify-center rounded-full border border-dashed" />
              <span className="flex-1 text-muted-foreground">Unassigned</span>
            </DropdownMenuItem>
          ) : null}
          {active.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No workspace members yet.</div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No members match.</div>
          ) : (
            filtered.map((m) => (
              <DropdownMenuItem
                key={m.user_id}
                onSelect={() => assign.mutate({ storyId: story.id, assigneeId: m.user_id })}
              >
                <Avatar name={m.display_name} src={m.avatar_url} size="xs" />
                <span className="flex-1 truncate">{m.display_name}</span>
                {story.assignee_id === m.user_id ? (
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!agent) return picker;

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block">
              <AgentAvatar
                role={agent.role}
                persona={agent.persona}
                display_name={agent.display_name}
                size="xs"
                pop={false}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{agent.display_name} — AI agent</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {picker}
    </div>
  );
}
