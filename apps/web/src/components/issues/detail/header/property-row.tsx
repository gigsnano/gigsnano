"use client";

import {
  StoryAgentPicker,
  StoryAssigneePicker,
  StoryStatusPicker,
} from "@/components/board";
import { PriorityPicker } from "@/components/issues/shared/priority-picker";
import { StoryDateField } from "@/components/issues/detail/properties/date-field";
import { GigsAiStoryButton } from "@/components/ai/gigs-ai-story-button";
import type { IStory } from "@/types";

export function IssuePropertyRow({
  story,
  workspaceSlug,
  projectId,
  cycleId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  return (
    <div className="-ml-2 flex flex-wrap items-center gap-0.5">
      <StoryStatusPicker
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        hideLabel
      />
      <PriorityPicker
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
      />
      <StoryAssigneePicker
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        hideLabel
      />
      {!story.bmad ? (
        <StoryAgentPicker
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          hideLabel
        />
      ) : null}
      <StoryDateField
        story={story}
        field="start_date"
        label="Start date"
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
      />
      <StoryDateField
        story={story}
        field="target_date"
        label="Due date"
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
      />
      <GigsAiStoryButton
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        variant="pill"
      />
    </div>
  );
}
