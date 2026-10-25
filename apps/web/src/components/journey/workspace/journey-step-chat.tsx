"use client";

import { StoryChat } from "@/components/board";
import { useStory } from "@/hooks/story/use-stories";

/**
 * Region 2 of the journey step workspace — the REAL agent conversation
 * (GIN-434 Phase 1). A journey step id IS a Sprint-0 Story id, so we reuse the
 * canonical BMAD `StoryChat` (SSE stream + finalize) keyed by that story rather
 * than a journey-specific chat. Replaces the old mock `AgentConversation`.
 */
export function JourneyStepChat({
  workspaceSlug,
  projectId,
  storyId,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const { data: story, isPending, isError } = useStory(workspaceSlug, projectId, storyId);

  return (
    // h-full at every breakpoint: the column is bounded now, so the chat fills it
    // and StoryChat's own viewport/composer split does the rest (GIN-476).
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      {isPending ? (
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="h-16 w-4/5 animate-pulse rounded-2xl rounded-bl-sm bg-muted" />
          <div className="ml-auto h-10 w-3/5 animate-pulse rounded-2xl rounded-br-sm bg-muted" />
          <div className="h-12 w-2/3 animate-pulse rounded-2xl rounded-bl-sm bg-muted" />
        </div>
      ) : isError || !story ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Couldn&apos;t load this step&apos;s agent thread.
        </div>
      ) : (
        <StoryChat story={story} workspaceSlug={workspaceSlug} projectId={projectId} />
      )}
    </div>
  );
}
