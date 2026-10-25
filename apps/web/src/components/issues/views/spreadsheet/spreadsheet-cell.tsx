"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { STORY_PRIORITY_META, STORY_STATUS_META, STORY_TYPE_META } from "@/constants/story-meta";
import { storyTypeOf } from "@/lib/issues/story-type";
import type { IStory } from "@/types";
import type { ISortCtx } from "@/lib/issues/story-sort";
import type { IAssigneePreview } from "@/lib/issues/story-assignees";

import { TypeGlyph } from "../../shared/type-glyph";
import { StatusPicker } from "../../shared/status-picker";
import { PriorityPicker } from "../../shared/priority-picker";
import { AssigneePicker } from "../../shared/assignee-picker";
import { StoryLabelPicker } from "@/components/board/pickers/story-label-picker";
import { StoryEstimatePicker } from "@/components/board/pickers/story-estimate-picker";
import { StorySizePicker } from "@/components/board/pickers/story-size-picker";
import { StoryDurationPicker } from "@/components/board/pickers/story-duration-picker";
import { StoryDateField } from "../../detail/properties/date-field";
import { StoryCyclePicker } from "../../detail/properties/cycle-picker";
import { StoryModulePicker } from "../../detail/properties/module-picker";
import type { SpreadsheetColumnKey } from "@/lib/issues/spreadsheet-columns";

/** Fixed-width `<td>`; the width is driven by the persisted column layout. */
export function SheetTd({
  width,
  className = "",
  children,
}: {
  width: number;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = { width, minWidth: width, maxWidth: width };
  return (
    <td
      style={style}
      className={cn("h-11 border-r border-b px-3 align-middle", className)}
    >
      <div className="flex h-full items-center overflow-hidden">{children}</div>
    </td>
  );
}

// Format in UTC so server and client render identically (no hydration drift).
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

export interface ISpreadsheetCellCtx {
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  assignees: Map<string, IAssigneePreview>;
  /** Shared sort context from `useIssuesData` — nested rows sort with the same
   *  resolver the top-level rows do, so an assignee sort reads by name at
   *  every depth. */
  sortCtx?: ISortCtx;
}

/** Renders the inline control (or read-only value) for one property column. */
export function PropertyCell({
  column,
  story,
  ctx,
}: {
  column: SpreadsheetColumnKey;
  story: IStory;
  ctx: ISpreadsheetCellCtx;
}) {
  const pickerProps = {
    story,
    workspaceSlug: ctx.workspaceSlug,
    projectId: ctx.projectId,
    cycleId: ctx.cycleId,
  };

  switch (column) {
    case "status":
      return (
        <span className="flex items-center gap-1.5">
          <StatusPicker {...pickerProps} />
          <span className="truncate text-xs text-muted-foreground">
            {STORY_STATUS_META[story.status].label}
          </span>
        </span>
      );
    case "priority":
      // compact = icon-only glyph; the label span next to it is the single label
      // (without compact the picker renders its own glyph+label → a doubled "Medium").
      return (
        <span className="flex items-center gap-1.5">
          <PriorityPicker {...pickerProps} compact />
          <span className="truncate text-xs text-muted-foreground">
            {STORY_PRIORITY_META[story.priority].label}
          </span>
        </span>
      );
    case "assignee": {
      const name = story.assignee_id
        ? ctx.assignees.get(story.assignee_id)?.display_name
        : undefined;
      return (
        <span className="flex items-center gap-1.5">
          <AssigneePicker {...pickerProps} />
          <span className="truncate text-xs text-muted-foreground">{name ?? "Unassigned"}</span>
        </span>
      );
    }
    case "type": {
      const type = storyTypeOf(story);
      return (
        <span className="flex items-center gap-1.5">
          <TypeGlyph type={type} className="size-3.5" />
          <span className="truncate text-xs text-muted-foreground">
            {STORY_TYPE_META[type].label}
          </span>
        </span>
      );
    }
    case "label":
      return <StoryLabelPicker {...pickerProps} hideLabel />;
    case "estimate":
      // Per-method controls (GIN-331): each self-gates, so the estimate column
      // shows the active method's control (points/size/duration) or nothing.
      return (
        <>
          <StoryEstimatePicker {...pickerProps} hideLabel />
          <StorySizePicker {...pickerProps} hideLabel />
          <StoryDurationPicker {...pickerProps} hideLabel />
        </>
      );
    case "cycle":
      return <StoryCyclePicker {...pickerProps} />;
    case "module":
      return <StoryModulePicker {...pickerProps} />;
    case "start_date":
      return <StoryDateField {...pickerProps} field="start_date" label="Start date" />;
    case "target_date":
      return <StoryDateField {...pickerProps} field="target_date" label="Due date" />;
    case "created_at":
      return <span className="text-xs tabular-nums text-muted-foreground">{fmtDate(story.created_at)}</span>;
    case "updated_at":
      return <span className="text-xs tabular-nums text-muted-foreground">{fmtDate(story.updated_at)}</span>;
    case "sub_issue":
      return (
        <span className="text-xs tabular-nums text-muted-foreground">
          {story.sub_issue_count > 0 ? story.sub_issue_count : "—"}
        </span>
      );
    default:
      return null;
  }
}
