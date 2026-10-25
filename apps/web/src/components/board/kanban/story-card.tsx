"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SquareLock01Icon, CheckmarkCircle02Icon, SparklesIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { agentAvatarFromStory, type TAssigneeAvatar } from "@/lib/issues/assignee-avatars";
import { storyTypeOf } from "@/lib/issues/story-type";
import type { IAssigneePreview } from "@/lib/issues/story-assignees";
import { EStoryStatus, type IStory } from "@/types";

import { StoryLabelChip } from "@/components/board/pickers/story-label-picker";
import { StoryEstimateChip } from "@/components/board/pickers/story-estimate-picker";
import { BmadLockNotice } from "@/components/board/kanban/bmad-lock-notice";
import { StoryCode } from "@/components/issues/shared/story-code";
import { TypeGlyph } from "@/components/issues/shared/type-glyph";
import type { IBmadLockMessage } from "@/lib/bmad/bmad-unlock";
import type { IProjectEstimate } from "@/types";

export function StoryCard({
  story,
  onOpen,
  draggable = false,
  assignee,
  labels,
  estimate,
  lockMessage,
}: {
  story: IStory;
  onOpen: (story: IStory) => void;
  draggable?: boolean;
  assignee?: IAssigneePreview | null;
  labels?: { name: string; color: string }[];
  estimate?: { points: number; type: IProjectEstimate["type"] } | null;
  lockMessage?: IBmadLockMessage | null;
}) {
  const locked = Boolean(lockMessage);
  const skipped = story.bmad?.skipped === true;
  const done = story.status === EStoryStatus.Done || skipped;
  const canDrag = draggable && !locked;
  const [shaking, setShaking] = useState(false);

  const agent = agentAvatarFromStory(story);
  const items: TAssigneeAvatar[] = [
    ...(agent ? [agent] : []),
    ...(assignee
      ? [
          {
            kind: "human" as const,
            id: assignee.user_id,
            display_name: assignee.display_name,
            avatar_url: assignee.avatar_url,
          },
        ]
      : []),
  ];

  return (
    <button
      type="button"
      aria-disabled={locked || undefined}
      draggable={canDrag}
      onDragStart={
        canDrag
          ? (e) => {
              e.dataTransfer.setData("text/story-id", story.id);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onClick={() => {
        if (locked) {
          setShaking(true);
          window.setTimeout(() => setShaking(false), 400);
        }
        onOpen(story);
      }}
      id={`story-${story.id}`}
      className={cn(
        "gn-kanban-card group/story",
        locked && "cursor-pointer border-amber-500/25 bg-amber-500/[0.03]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {story.bmad ? `Step ${story.order + 1}` : story.status.replace("_", " ")}
        </span>
        <div className="flex items-center gap-1.5">
          <TypeGlyph type={storyTypeOf(story)} className="size-3.5" />
          {items.length > 0 ? <AvatarGroup items={items} size="xs" max={3} /> : null}
          {locked ? (
            <HugeiconsIcon icon={SquareLock01Icon} className="size-3.5 text-amber-700 dark:text-amber-300" />
          ) : done ? (
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-emerald-500" />
          ) : (
            <HugeiconsIcon
              icon={SparklesIcon}
              className="size-4 text-primary opacity-0 transition-opacity group-hover/story:opacity-100"
            />
          )}
        </div>
      </div>

      <StoryCode code={story.code} />
      <h4 className="gn-kanban-card-title">{story.title}</h4>

      {lockMessage ? <BmadLockNotice message={lockMessage} shaking={shaking} /> : null}

      {labels?.length ? (
        <div className="flex flex-wrap gap-1">
          {labels.map((l) => (
            <StoryLabelChip key={l.name} name={l.name} color={l.color} />
          ))}
        </div>
      ) : null}

      {estimate ? (
        <StoryEstimateChip points={estimate.points} type={estimate.type} />
      ) : null}

      {story.bmad ? (
        <>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{story.bmad.agent}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {story.bmad.artifact}
            </span>
            {!story.bmad.is_required ? (
              <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                optional
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </button>
  );
}
