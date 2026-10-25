"use client";

import { StoryChat } from "@/components/board/story/story-chat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EStoryType, type IStory } from "@/types";

const BREAK_DOWN_WORKFLOW = "bmad-break-down-epic";

export function EpicBreakDownButton({
  story,
  onOpen,
}: {
  story: IStory;
  onOpen: () => void;
}) {
  if (story.type !== EStoryType.Epic) return null;

  const disabled = (story.sub_issue_count ?? 0) > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              className="transition-transform duration-150 ease-out active:scale-[0.97]"
              onClick={onOpen}
            >
              Break down with AI
            </Button>
          </span>
        </TooltipTrigger>
        {disabled ? (
          <TooltipContent>
            Epic already has sub-work items. Add manually or remove children first.
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}

export function EpicBreakDownSheet({
  open,
  onOpenChange,
  story,
  workspaceSlug,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: IStory;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <div className="border-b px-5 py-4">
          <SheetTitle className="text-base">Break down epic</SheetTitle>
          <p className="text-sm text-muted-foreground">{story.title}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <StoryChat
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            workflowOverride={BREAK_DOWN_WORKFLOW}
            mode="break-down"
            onBreakDownComplete={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
