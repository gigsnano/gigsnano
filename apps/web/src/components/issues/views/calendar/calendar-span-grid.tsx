"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { peekHref, storyCode } from "@/lib/issues/issue-routes";
import { storyTypeOf } from "@/lib/issues/story-type";
import { placeBySpan } from "@/lib/issues/calendar-span";
import { STORY_STATUS_META } from "@/constants/story-meta";
import type { IStory } from "@/types";

import { TypeGlyph } from "../../shared/type-glyph";

/**
 * Lanes drawn per week before the rest are counted instead.
 *
 * Three keeps a row's height predictable — the grid is six equal rows, so a
 * busy week must not squash the others. What doesn't fit is reported, never
 * silently dropped.
 */
const MAX_LANES = 3;
const LANE_HEIGHT = 20;

/**
 * The span renderer: bars laid across the days an item covers.
 *
 * A separate component from the day-cell grid on purpose. A bar layered ACROSS
 * cells and an item stacked INSIDE one cell are different layouts — the bar
 * needs a positioned overlay per week row, the stack needs flow inside a cell.
 * One component doing both would be a thicket of conditionals in every branch.
 */
export function CalendarSpanGrid({
  stories,
  gridDays,
  month,
  todayKey,
  identifier,
}: {
  stories: IStory[];
  /** The 42 day keys, from `calendarGridStart` — shared with the day cells so a
   *  bar and the date under it can never disagree about a column. */
  gridDays: string[];
  /** 0-based month being viewed, for dimming the out-of-month days. */
  month: number;
  todayKey: string;
  identifier: string;
}) {
  const rows = placeBySpan(stories, gridDays, MAX_LANES);

  return (
    <div className="grid min-h-0 flex-1 grid-rows-6">
      {rows.map((row) => (
        <div key={row.days[0]} className="relative min-h-0 border-b">
          {/* Day cells: backgrounds, borders and the date numbers. The bars sit
              above these in their own layer. */}
          <div className="grid h-full grid-cols-7">
            {row.days.map((day, col) => {
              const d = new Date(`${day}T00:00:00`);
              const inMonth = d.getMonth() === month;
              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-0 border-r p-1",
                    !inMonth && "bg-muted/30",
                    col === 6 && "border-r-0",
                  )}
                >
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                        day === todayKey
                          ? "bg-primary font-semibold text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bar layer. `pointer-events-none` on the layer, restored on each bar,
              so the empty space between bars doesn't swallow clicks meant for
              the day cell beneath. */}
          <div className="pointer-events-none absolute inset-x-0 top-7 z-[1]">
            {row.segments.map((seg) => (
              <Link
                key={`${seg.story.id}-${seg.startCol}`}
                href={peekHref(seg.story)}
                scroll={false}
                title={`${storyTypeOf(seg.story)} · ${storyCode(identifier, seg.story)} ${seg.story.title}`}
                style={{
                  left: `calc(${(seg.startCol / 7) * 100}% + 2px)`,
                  width: `calc(${((seg.endCol - seg.startCol + 1) / 7) * 100}% - 4px)`,
                  top: seg.lane * LANE_HEIGHT,
                }}
                className={cn(
                  "pointer-events-auto absolute flex h-[18px] items-center gap-1 overflow-hidden bg-muted/70 px-1.5 text-xs text-foreground transition-colors hover:bg-accent",
                  // Flat edge where the span continues, rounded where it truly
                  // begins or ends — so a bar reads as a piece of something
                  // longer rather than a short item that happens to sit there.
                  seg.continuesLeft ? "rounded-l-none" : "rounded-l-md",
                  seg.continuesRight ? "rounded-r-none" : "rounded-r-md",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    STORY_STATUS_META[seg.story.status].fill,
                  )}
                />
                <TypeGlyph type={storyTypeOf(seg.story)} className="size-3 shrink-0" />
                <span className="truncate">{seg.story.title}</span>
              </Link>
            ))}

            {row.hiddenCount > 0 ? (
              <span
                className="absolute right-1 text-[11px] text-muted-foreground"
                style={{ top: MAX_LANES * LANE_HEIGHT }}
                title={`${row.hiddenCount} more overlap this week than the row can show`}
              >
                +{row.hiddenCount} more
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
