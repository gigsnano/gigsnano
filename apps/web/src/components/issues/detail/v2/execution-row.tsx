"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { UserIcon } from "@hugeicons/core-free-icons";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { useStoryRuns } from "@/hooks/story/use-story-detail";
import { agentAvatarFromStory } from "@/lib/issues/assignee-avatars";
import type { WorkItemTab } from "@/lib/issues/work-item-tabs";
import type { EAgentRunState } from "@/types/story/agent-run";
import type { IStory } from "@/types";

const RUN_STATE_LABEL: Record<EAgentRunState, string> = {
  queued: "Queued",
  planning: "Planning",
  executing: "Running",
  awaiting_review: "Waiting for review",
  done: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

/**
 * One-line execution state on Overview (GIN-480).
 *
 * Reads as a sentence — `Sarah Chen · delegated to Developer agent · Running` —
 * because that is a thing a PM can act on. Three separate widgets at three
 * scroll depths, which is what this replaces, never said it.
 *
 * The row IS the control: `Change` opens Properties in place rather than
 * sending the reader to another tab to do the thing they just read about. Only
 * the heavy surfaces (run history, execution chat, advanced settings) live on
 * Runs.
 */
export function ExecutionRow({
  story,
  workspaceSlug,
  projectId,
  onChange,
  onGoToTab,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  onChange: () => void;
  onGoToTab: (tab: WorkItemTab) => void;
}) {
  const agent = agentAvatarFromStory(story);
  const { data: members } = useProjectMembers(workspaceSlug, projectId);
  const assignee = story.assignee_id
    ? (members ?? []).find((m) => m.user_id === story.assignee_id)
    : undefined;

  // One request for the run list, not per-run logs — those are the Runs tab's.
  const { data: runs } = useStoryRuns(workspaceSlug, projectId, agent ? story.id : "");
  const latestRun = runs?.[0];

  const unassigned = !agent && !story.assignee_id;

  return (
    <section className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-border/60 py-2.5 text-sm">
      <span className="text-muted-foreground">Execution</span>
      <span className="text-border" aria-hidden>
        ·
      </span>

      {unassigned ? (
        <span className="text-muted-foreground">Not assigned</span>
      ) : (
        <>
          {assignee ? (
            <span className="flex items-center gap-1.5 text-foreground">
              <Avatar name={assignee.display_name} src={assignee.avatar_url} size="xs" />
              {assignee.display_name}
            </span>
          ) : story.assignee_id ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HugeiconsIcon icon={UserIcon} className="size-3.5" />
              Assigned
            </span>
          ) : null}

          {agent ? (
            <span className="flex items-center gap-1.5 text-foreground">
              {assignee ? <span className="text-muted-foreground">delegated to</span> : null}
              <AgentAvatar
                role={agent.role}
                persona={agent.persona}
                display_name={agent.display_name}
                size="xs"
                pop={false}
              />
              {agent.display_name}
            </span>
          ) : null}

          {latestRun ? (
            <>
              <span className="text-border" aria-hidden>
                ·
              </span>
              {/* The state label is the payload, so it earns the text swap. */}
              <span
                key={latestRun.state}
                className="text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150"
              >
                {RUN_STATE_LABEL[latestRun.state]}
              </span>
            </>
          ) : null}
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        {agent ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs active:scale-[0.97]"
            onClick={() => onGoToTab("runs")}
          >
            View runs
          </Button>
        ) : null}
        <Button
          variant={unassigned ? "outline" : "ghost"}
          size="sm"
          className="h-7 text-xs active:scale-[0.97]"
          onClick={onChange}
        >
          {unassigned ? "Assign work" : "Change"}
        </Button>
      </div>
    </section>
  );
}
