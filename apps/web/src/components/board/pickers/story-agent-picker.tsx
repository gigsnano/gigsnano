"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BMAD_AGENTS } from "@/constants/bmad-agents";
import { useAssignStoryAgent } from "@/hooks/story/use-stories";
import { agentAvatarFromStory } from "@/lib/issues/assignee-avatars";
import { cn } from "@/lib/utils";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import type { IStory } from "@/types";

/** Swappable AI-agent picker for manual (non-BMAD) work items. */
export function StoryAgentPicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  hideLabel = false,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  hideLabel?: boolean;
}) {
  const assign = useAssignStoryAgent(workspaceSlug, projectId, cycleId);
  const current = agentAvatarFromStory(story);

  return (
    <div className="flex items-center gap-2">
      {!hideLabel ? (
        <span className="text-xs font-medium text-muted-foreground">AI agent</span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={current ? `AI agent: ${current.display_name}` : "Assign AI agent"}
          className={cn(propertyTrigger, current && "text-foreground")}
        >
          {current ? (
            <>
              <AgentAvatar
                role={current.role}
                persona={current.persona}
                display_name={current.display_name}
                size="xs"
                pop={false}
              />
              <span className="max-w-[8rem] truncate">{current.display_name}</span>
            </>
          ) : (
            <>
              <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
              <span>No agent</span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
          {BMAD_AGENTS.map((a) => (
            <DropdownMenuItem
              key={a.id}
              disabled={assign.isPending}
              onSelect={() => assign.mutate({ storyId: story.id, agentId: a.id })}
            >
              <AgentAvatar role={a.name} persona={a.persona} display_name={`${a.name} · ${a.persona}`} size="xs" pop={false} />
              <span className="flex-1 truncate">
                {a.persona} · {a.name}
              </span>
              {story.ai_agent_id === a.id ? (
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
          {story.ai_agent_id ? (
            <DropdownMenuItem
              disabled={assign.isPending}
              onSelect={() => assign.mutate({ storyId: story.id, agentId: null })}
            >
              <HugeiconsIcon icon={Cancel01Icon} className={cn("size-4 text-muted-foreground")} />
              Clear agent
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
