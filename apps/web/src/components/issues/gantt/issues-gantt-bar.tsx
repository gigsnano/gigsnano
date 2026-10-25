"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { peekHref } from "@/lib/issues/issue-routes";
import { STORY_STATUS_META } from "@/constants/story-meta";
import type { IStory } from "@/types";
import { DEFAULT_BLOCK_WIDTH } from "@/components/projects/views/gantt/gantt-config";
import { getTimelineBarPosition } from "@/components/projects/views/gantt/gantt-date-math";
import { useIssuesGanttBarDrag, type TGanttDatePatch } from "./use-issues-gantt-bar-drag";

type TGanttBarProps = {
  story: IStory;
  chartStart: Date;
  dayWidth: number;
  onCommitDates: (patch: TGanttDatePatch) => void;
};

/**
 * Draggable / resizable timeline bar — Plane partial-date + half-block rules.
 *
 * Holds no hooks on purpose: `position` is null for a story with no dates, and
 * gaining dates while mounted would otherwise grow the hook count mid-render
 * ("Rendered more hooks than during the previous render"). Keeping the early
 * return in a hookless wrapper makes that a mount/unmount instead.
 */
export function IssuesGanttBar(props: TGanttBarProps) {
  const { story, chartStart, dayWidth } = props;

  const position = getTimelineBarPosition(
    { start_date: story.start_date, target_date: story.target_date },
    chartStart,
    dayWidth,
    DEFAULT_BLOCK_WIDTH,
  );
  if (!position) return null;

  return <GanttBar {...props} left={position.left} barWidth={Math.max(position.width - 4, 8)} />;
}

function GanttBar({
  story,
  chartStart,
  dayWidth,
  onCommitDates,
  left,
  barWidth,
}: TGanttBarProps & { left: number; barWidth: number }) {
  const router = useRouter();
  const hadStart = Boolean(story.start_date);
  const hadTarget = Boolean(story.target_date);
  const isComplete = hadStart && hadTarget;

  const { barRef, dragMode, visual, startDrag } = useIssuesGanttBarDrag({
    chartStart,
    dayWidth,
    chartLeft: left,
    chartWidth: barWidth,
    onCommit: onCommitDates,
    hadStart,
    hadTarget,
    enableMove: isComplete,
  });

  const fill = STORY_STATUS_META[story.status].fill;

  return (
    <div
      ref={barRef}
      className={cn(
        "absolute top-1/2 z-[2] flex -translate-y-1/2 overflow-hidden rounded-md shadow-sm",
        fill,
        dragMode && "z-20 ring-2 ring-primary/40",
      )}
      style={{ left: visual.left, width: visual.width, height: 24 }}
      title={`${story.title} · ${story.start_date ?? "—"} → ${story.target_date ?? "—"}`}
    >
      <button
        type="button"
        aria-label="Resize start date"
        className="w-2 shrink-0 cursor-col-resize border-0 bg-black/0 p-0 hover:bg-black/15"
        onMouseDown={(e) => startDrag(e, "left")}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={
          isComplete
            ? `${story.title} — drag to reschedule; press Enter to open`
            : `${story.title} — resize edges to set dates; press Enter to open`
        }
        className={cn(
          "flex min-w-0 flex-1 select-none items-center px-1 text-xs font-medium text-white",
          isComplete
            ? dragMode === "move"
              ? "cursor-grabbing"
              : "cursor-grab"
            : "cursor-default",
        )}
        onMouseDown={(e) => {
          if (isComplete) startDrag(e, "move");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(peekHref(story), { scroll: false });
          }
        }}
      >
        <Link
          href={peekHref(story)}
          scroll={false}
          className="min-w-0 truncate hover:underline"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {story.title}
        </Link>
      </div>

      <button
        type="button"
        aria-label="Resize target date"
        className="w-2 shrink-0 cursor-col-resize border-0 bg-black/0 p-0 hover:bg-black/15"
        onMouseDown={(e) => startDrag(e, "right")}
      />
    </div>
  );
}
