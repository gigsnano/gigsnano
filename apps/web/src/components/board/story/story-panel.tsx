"use client";

import Link from "next/link";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { PublishListingDialog } from "@/components/marketplace/listings/publish-listing-dialog";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Button } from "@/components/ui/button";
import { SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompleteStory, useSkipStory } from "@/hooks/story/use-stories";
import { useWorkspaceAdmin } from "@/hooks/workspace/use-workspace-admin";
import { agentAvatarFromStory } from "@/lib/issues/assignee-avatars";
import { EReadinessResult, EStoryStatus, type IDocument, type IStory } from "@/types";
import { cn } from "@/lib/utils";

import { StoryChat } from "@/components/board/story/story-chat";
import { DelegateCardButton } from "@/components/board/story/delegate-card-button";
import { StoryAssigneePicker } from "@/components/board/pickers/story-assignee-picker";
import { StoryLabelPicker } from "@/components/board/pickers/story-label-picker";
import { StoryEstimatePicker } from "@/components/board/pickers/story-estimate-picker";
import { StorySizePicker } from "@/components/board/pickers/story-size-picker";
import { StoryDurationPicker } from "@/components/board/pickers/story-duration-picker";

const READINESS_OPTIONS: { value: EReadinessResult; label: string; hint: string }[] = [
  { value: EReadinessResult.Pass, label: "PASS", hint: "Unlocks sprint planning" },
  { value: EReadinessResult.Concerns, label: "CONCERNS", hint: "Document risks; sprint planning stays locked" },
  { value: EReadinessResult.Fail, label: "FAIL", hint: "Return to planning; sprint planning stays locked" },
];

export function StoryPanel({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  onCompleted,
  projectDocuments,
  scopedStories,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  onCompleted: () => void;
  projectDocuments?: IDocument[];
  scopedStories?: IStory[];
}) {
  const complete = useCompleteStory(workspaceSlug, projectId, cycleId);
  const skip = useSkipStory(workspaceSlug, projectId, cycleId);
  const { isAdmin } = useWorkspaceAdmin(workspaceSlug);
  const [publishOpen, setPublishOpen] = useState(false);
  const [readiness, setReadiness] = useState<EReadinessResult | null>(
    story.bmad?.readiness_result ?? null,
  );

  const agent = agentAvatarFromStory(story);

  const done = story.status === EStoryStatus.Done;
  const skipped = story.bmad?.skipped === true;
  const isGate = story.bmad?.workflow === "bmad-check-implementation-readiness";
  const canSkip = story.bmad && !story.bmad.is_required && !done && !skipped;

  const onComplete = () => {
    complete.mutate(
      { storyId: story.id, readinessResult: isGate ? readiness ?? undefined : undefined },
      { onSuccess: onCompleted },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b px-5 py-4 pr-12">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Step {story.order + 1}</span>
          {story.bmad ? (
            <>
              <span>·</span>
              <span>{story.bmad.agent}</span>
            </>
          ) : null}
        </div>
        <SheetTitle className="text-base">{story.title}</SheetTitle>
        <SheetDescription className="mt-0.5">{story.description}</SheetDescription>
        {story.bmad ? (
          <span className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            Produces: {story.bmad.artifact}
          </span>
        ) : null}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Assignees</span>
            {agent ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block">
                      <AgentAvatar
                        role={agent.role}
                        persona={agent.persona}
                        display_name={agent.display_name}
                        size="sm"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{agent.display_name} — AI agent (owns this step)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            <StoryAssigneePicker
              story={story}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              hideLabel
            />
          </div>
          {!story.bmad ? (
            <>
              <StoryLabelPicker
                story={story}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                cycleId={cycleId}
              />
              {/* Per-method estimate controls (GIN-331) — each self-gates to its
                  planning method, so exactly one (or none, in Automatic) renders. */}
              <StoryEstimatePicker
                story={story}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                cycleId={cycleId}
              />
              <StorySizePicker
                story={story}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                cycleId={cycleId}
              />
              <StoryDurationPicker
                story={story}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                cycleId={cycleId}
              />
            </>
          ) : null}
        </div>
      </div>

      <StoryChat
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        projectDocuments={projectDocuments}
        scopedStories={scopedStories}
      />

      <div className="shrink-0 space-y-3 border-t p-4">
        {isGate && !done ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Implementation readiness</p>
            <div className="grid grid-cols-3 gap-1.5">
              {READINESS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReadiness(opt.value)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left transition-[transform,colors] duration-150 ease-out active:scale-[0.97]",
                    readiness === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-accent/50",
                  )}
                >
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
            {readiness && readiness !== EReadinessResult.Pass ? (
              <p className="text-xs text-muted-foreground">
                Review and update{" "}
                <Link
                  href={`/${workspaceSlug}/docs`}
                  className="font-medium text-primary hover:underline"
                >
                  planning docs
                </Link>{" "}
                before marking complete — sprint planning stays locked until PASS.
              </p>
            ) : null}
          </div>
        ) : null}

        {done || skipped ? (
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
            {skipped ? "Step skipped" : "Step complete"}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {story.bmad && !isGate ? (
              <DelegateCardButton
                story={story}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
              />
            ) : null}
            {isAdmin && !done && !skipped ? (
              <Button
                type="button"
                variant="outline"
                className="w-full transition-transform duration-150 ease-out active:scale-[0.97]"
                onClick={() => setPublishOpen(true)}
              >
                Publish to marketplace
              </Button>
            ) : null}
            <div className="flex gap-2">
            {canSkip ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]"
                disabled={skip.isPending}
                onClick={() => skip.mutate(story.id, { onSuccess: onCompleted })}
              >
                {skip.isPending ? "Skipping…" : "Skip"}
              </Button>
            ) : null}
            <Button
              className="flex-1 transition-transform duration-150 ease-out active:scale-[0.97]"
              disabled={complete.isPending || (isGate && !readiness)}
              onClick={onComplete}
            >
              {complete.isPending ? "Completing…" : "Mark step complete"}
            </Button>
            </div>
          </div>
        )}
      </div>
      {isAdmin ? (
        <PublishListingDialog
          workspaceSlug={workspaceSlug}
          storyId={story.id}
          defaultTitle={story.title}
          defaultDescription={story.description ?? ""}
          open={publishOpen}
          onOpenChange={setPublishOpen}
        />
      ) : null}
    </div>
  );
}
