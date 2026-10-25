"use client";

import { RunWithAgentButton } from "@/components/ai/delegation/run-with-agent-button";
import { EDelegationUnit } from "@/types/ai/agent-delegation";
import type { IStory } from "@/types";

export function DelegateCardButton({
  story,
  workspaceSlug,
  projectId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <div className="t-delegation-card rounded-lg border border-dashed p-2">
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        Or delegate this step to your own coding agent (runs on your account).
      </p>
      <RunWithAgentButton
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        storyId={story.id}
        unitType={EDelegationUnit.BmadCard}
        hasRepo
      />
    </div>
  );
}
