"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, formatISODate, getDateFromPixel } from "@/components/projects/views/gantt/gantt-date-math";

/**
 * Plane ChartAddBlock — hover + click to schedule an undated work item.
 * Week/Month: target = start + 1 day. Quarter: target = start + 7 days.
 */
export function IssuesGanttAddBlock({
  chartStart,
  dayWidth,
  spanDays = 1,
  onSchedule,
}: {
  chartStart: Date;
  dayWidth: number;
  /** Inclusive days after start (Plane: 1 week/month, 7 quarter). */
  spanDays?: number;
  onSchedule: (startDate: string, targetDate: string) => void;
}) {
  const [cursorX, setCursorX] = useState(0);
  const [hovering, setHovering] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const hoverDate = getDateFromPixel(cursorX, chartStart, dayWidth);
  const hoverLabel = hoverDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const schedule = () => {
    const start = getDateFromPixel(cursorX, chartStart, dayWidth);
    const end = addDays(start, spanDays);
    onSchedule(formatISODate(start), formatISODate(end));
  };

  return (
    <div
      ref={trackRef}
      className="relative h-full w-full"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={(e) => setCursorX(e.nativeEvent.offsetX)}
    >
      {hovering ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Schedule starting ${hoverLabel}`}
                className="absolute top-1/2 z-[2] flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground active:scale-[0.97]"
                style={{ left: cursorX }}
                onClick={schedule}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{hoverLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}
