"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  GitBranchIcon,
  SquareLock01Icon,
  Tag01Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";

import { BmadLockNotice } from "@/components/board/kanban/bmad-lock-notice";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { storyCode } from "@/lib/issues/issue-routes";
import type { IBmadLockMessage } from "@/lib/bmad/bmad-unlock";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { StoryCode } from "@/components/issues/shared/story-code";
import { TypeGlyph } from "@/components/issues/shared/type-glyph";
import { storyTypeOf } from "@/lib/issues/story-type";
import type { IAssigneePreview } from "@/lib/issues/story-assignees";
import { EStoryPriority, type IStory } from "@/types";

const fmtShort = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

/**
 * Plane kanban card — issue key → 2-line title → property chips.
 * Height/padding come from `.gn-kanban-card` tokens in globals.css.
 */
export function WorkItemKanbanCard({
  story,
  identifier,
  onOpen,
  draggable = false,
  assignee,
  labels,
  lockMessage,
}: {
  story: IStory;
  identifier: string;
  onOpen: (story: IStory) => void;
  draggable?: boolean;
  assignee?: IAssigneePreview | null;
  labels?: { name: string; color: string }[];
  lockMessage?: IBmadLockMessage | null;
}) {
  const locked = Boolean(lockMessage);
  const canDrag = draggable && !locked;
  const [shaking, setShaking] = useState(false);
  const dueLabel = fmtShort(story.target_date);
  const hasPriority = story.priority !== EStoryPriority.None;

  const onClick = () => {
    if (locked) {
      setShaking(true);
      window.setTimeout(() => setShaking(false), 400);
    }
    onOpen(story);
  };

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
      onClick={onClick}
      id={`story-${story.id}`}
      className={cn(
        "gn-kanban-card group/wi-card",
        locked && "cursor-pointer border-amber-500/25 bg-amber-500/[0.03]",
      )}
    >
      <div className="relative flex items-center justify-between gap-2">
        <StoryCode code={storyCode(identifier, story)} />
        <div className="flex items-center gap-1">
          {locked ? (
            <HugeiconsIcon icon={SquareLock01Icon} className="size-3.5 text-amber-700 dark:text-amber-300" />
          ) : null}
          <TypeGlyph type={storyTypeOf(story)} className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
      </div>

      <h4 className="gn-kanban-card-title">{story.title}</h4>

      {lockMessage ? <BmadLockNotice message={lockMessage} shaking={shaking} /> : null}

      <div className="gn-kanban-card-props">
        <span className="gn-kanban-prop" data-active="true" title="Status">
          <StatusIcon status={story.status} className="size-4" />
        </span>

        <span
          className="gn-kanban-prop"
          data-active={hasPriority ? "true" : undefined}
          title={hasPriority ? `Priority: ${story.priority}` : "No priority"}
        >
          <PriorityGlyph priority={story.priority} />
        </span>

        {dueLabel ? (
          <span className="gn-kanban-prop" data-active="true" title={`Due ${dueLabel}`}>
            <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />
            <span className="gn-kanban-prop-label">{dueLabel}</span>
          </span>
        ) : null}

        <span
          className="gn-kanban-prop"
          data-active={assignee ? "true" : undefined}
          title={assignee ? assignee.display_name : "Unassigned"}
        >
          {assignee ? (
            <Avatar src={assignee.avatar_url} name={assignee.display_name} size="xs" />
          ) : (
            <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5" />
          )}
        </span>

        {labels?.map((label) => (
          <span key={label.name} className="gn-kanban-prop" data-active="true" title={label.name}>
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
            <HugeiconsIcon icon={Tag01Icon} className="size-3" />
            <span className="gn-kanban-prop-label">{label.name}</span>
          </span>
        ))}

        {story.sub_issue_count > 0 ? (
          <span
            className="gn-kanban-prop"
            data-active="true"
            title={`${story.sub_issue_count} sub-work items`}
          >
            <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" />
            <span className="gn-kanban-prop-label tabular-nums">{story.sub_issue_count}</span>
          </span>
        ) : null}
      </div>
    </button>
  );
}
