"use client";

import Link from "next/link";

import { peekHref, storyCode } from "@/lib/issues/issue-routes";
import type { IStory } from "@/types";
import { GANTT_ROW_HEIGHT } from "@/components/projects/views/gantt/gantt-config";
import type { TGanttDatePatch } from "./use-issues-gantt-bar-drag";
import { IssuesGanttAddBlock } from "./issues-gantt-add-block";
import { IssuesGanttBar } from "./issues-gantt-bar";

/** Plane: visible on chart when either date is set. */
function hasTimelineDate(story: IStory) {
  return Boolean(story.start_date || story.target_date);
}

/** One timeline row: status bar when dated, or click-to-add when undated. */
export function IssuesGanttChartRow({
  story,
  chartStart,
  dayWidth,
  chartWidth,
  addBlockSpanDays,
  onSchedule,
}: {
  story: IStory;
  chartStart: Date;
  dayWidth: number;
  chartWidth: number;
  addBlockSpanDays: number;
  onSchedule: (storyId: string, patch: TGanttDatePatch) => void;
}) {
  const onChart = hasTimelineDate(story);

  return (
    <div className="relative border-b" style={{ height: GANTT_ROW_HEIGHT, width: chartWidth }}>
      {onChart ? (
        <IssuesGanttBar
          story={story}
          chartStart={chartStart}
          dayWidth={dayWidth}
          onCommitDates={(patch) => onSchedule(story.id, patch)}
        />
      ) : (
        <IssuesGanttAddBlock
          chartStart={chartStart}
          dayWidth={dayWidth}
          spanDays={addBlockSpanDays}
          onSchedule={(startDate, targetDate) =>
            onSchedule(story.id, { start_date: startDate, target_date: targetDate })
          }
        />
      )}
    </div>
  );
}

/** Fixed left rail row aligned with a chart row. */
export function IssuesGanttSidebarRow({
  story,
  identifier,
}: {
  story: IStory;
  identifier: string;
}) {
  const complete = Boolean(story.start_date && story.target_date);
  const duration =
    complete && story.start_date && story.target_date
      ? Math.max(
          Math.round(
            (new Date(story.target_date).getTime() - new Date(story.start_date).getTime()) /
              86_400_000,
          ) + 1,
          1,
        )
      : null;

  return (
    <div
      className="flex items-center gap-2 border-b px-3"
      style={{ height: GANTT_ROW_HEIGHT }}
    >
      <span className="w-12 shrink-0 truncate font-mono max-sm:hidden text-[11px] text-muted-foreground">
        {storyCode(identifier, story)}
      </span>
      <Link
        href={peekHref(story)}
        scroll={false}
        className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-primary"
      >
        {story.title}
      </Link>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {duration != null ? `${duration}d` : "—"}
      </span>
    </div>
  );
}
