import { cn } from "@/lib/utils";

import { EGanttZoom, GANTT_HEADER_HEIGHT } from "./gantt-config";
import { dowLabel, type IDayColumn, type IMonthGroup, type IWeekColumn } from "./gantt-date-math";

/** Sticky two-row calendar header: month row over a day row (Week) or week row (Month/Quarter). */
export function GanttHeader({
  zoom,
  monthGroups,
  dayColumns,
  weekColumns,
  dayWidth,
}: {
  zoom: EGanttZoom;
  monthGroups: IMonthGroup[];
  dayColumns?: IDayColumn[];
  weekColumns?: IWeekColumn[];
  dayWidth: number;
}) {
  const isWeek = zoom === EGanttZoom.Week;
  const colWidth = isWeek ? dayWidth : dayWidth * 7;

  return (
    <div className="sticky top-0 z-10 bg-background" style={{ height: GANTT_HEADER_HEIGHT }}>
      {/* Month row */}
      <div className="flex h-7 border-b">
        {monthGroups.map((g) => (
          <div
            key={g.label}
            className="flex items-center border-r px-2 text-xs font-medium text-foreground"
            style={{ width: g.span * colWidth }}
          >
            <span className="truncate">{g.label}</span>
          </div>
        ))}
      </div>

      {/* Day (Week) or week (Month/Quarter) row */}
      <div className="flex h-7 border-b">
        {isWeek
          ? dayColumns?.map((c) => (
              <div
                key={c.date.toISOString().slice(0, 10)}
                className={cn(
                  "flex items-center justify-center gap-1 border-r text-[11px] tabular-nums",
                  c.isWeekend && "bg-muted/40",
                  c.isToday
                    ? "bg-primary/15 font-semibold text-primary"
                    : "text-muted-foreground",
                )}
                style={{ width: colWidth }}
              >
                <span>{dowLabel(c.date)}</span>
                <span>{c.date.getUTCDate()}</span>
              </div>
            ))
          : weekColumns?.map((c) => (
              <div
                key={c.start.toISOString().slice(0, 10)}
                className={cn(
                  "flex items-center justify-center border-r text-[11px] tabular-nums",
                  c.isCurrent
                    ? "bg-primary/15 font-semibold text-primary"
                    : "text-muted-foreground",
                )}
                style={{ width: colWidth }}
              >
                {c.label}
              </div>
            ))}
      </div>
    </div>
  );
}
