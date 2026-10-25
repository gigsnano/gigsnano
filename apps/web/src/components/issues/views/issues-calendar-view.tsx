"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { peekHref } from "@/lib/issues/issue-routes";
import { storyTypeOf } from "@/lib/issues/story-type";
import { countPlaceable, placeByDay } from "@/lib/issues/calendar-placement";
import {
  CALENDAR_CELLS,
  calendarGridStart,
  toDayKey,
} from "@/lib/issues/calendar-grid";
import { STORY_STATUS_META } from "@/constants/story-meta";
import { TypeGlyph } from "../shared/type-glyph";
import { CalendarSpanGrid } from "./calendar/calendar-span-grid";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import type { IStory } from "@/types";
import type { IIssuesData } from "@/hooks/issues/use-issues-data";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Items shown before a day collapses behind "+N more". */
const COLLAPSED_PER_DAY = 3;

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Calendar view — a month grid with work items placed on their target date. */
export function IssuesCalendarView({
  workspaceSlug,
  data,
}: {
  workspaceSlug: string;
  projectId: string;
  data: IIssuesData;
  cycleId?: string;
}) {
  const setCalendarMonthKey = useIssuesViewStore((s) => s.setCalendarMonthKey);
  const storedMonth = useIssuesViewStore((s) => s.calendarMonthKey);
  const basis = useIssuesViewStore((s) => s.calendarBasis);
  const [cursor, setCursor] = useState(() => {
    if (storedMonth) {
      const [y, m] = storedMonth.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  // Which days are showing everything rather than the first few. Per-day, not
  // global: opening one busy Tuesday shouldn't stretch every other cell.
  const [openDays, setOpenDays] = useState<string[]>([]);
  const toggleDay = (key: string) =>
    setOpenDays((open) => (open.includes(key) ? open.filter((k) => k !== key) : [...open, key]));

  useEffect(() => {
    setCalendarMonthKey(monthKey(cursor));
  }, [cursor, setCalendarMonthKey]);

  const byDate = placeByDay(data.stories, basis);

  // Built from the same helper the API filter uses, so the range drawn and the
  // range fetched cannot drift apart again.
  const cells = (() => {
    const start = calendarGridStart(monthKey(cursor));
    return Array.from({ length: CALENDAR_CELLS }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  })();

  const gridDays = cells.map(toDayKey);
  const todayKey = toDayKey(new Date());
  // Hoisted out of the 42-cell loop: `includes` would rescan the list per cell.
  const openSet = new Set(openDays);
  // Only speaks up when this basis places nothing AND the other would place
  // something — otherwise an genuinely empty month would nag pointlessly.
  const otherBasis = basis === "due" ? "start" : "due";
  const emptyButOtherBasisHas =
    basis !== "span" && byDate.size === 0 ? countPlaceable(data.stories, otherBasis) : 0;
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="gn-board-surface t-view-swap">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* An empty grid must not read as "no work" when it means "no work
              carrying this kind of date" — the other basis is one click away
              and the reader has no way to know it would help. */}
          {emptyButOtherBasisHas > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              none dated by {basis === "due" ? "due date" : "start date"} —{" "}
              {emptyButOtherBasisHas} by {basis === "due" ? "start date" : "due date"}
            </span>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-right">
            {d}
          </div>
        ))}
      </div>

      {basis === "span" ? (
        <CalendarSpanGrid
          stories={data.stories}
          gridDays={gridDays}
          month={month}
          todayKey={todayKey}
          identifier={data.project?.identifier ?? ""}
        />
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map((d, i) => {
          const key = toDayKey(d);
          const inMonth = d.getMonth() === month;
          const isToday = key === todayKey;
          const items = byDate.get(key) ?? [];
          const isDayOpen = openSet.has(key);
          return (
            <div
              key={key}
              className={cn(
                "min-h-0 overflow-hidden border-b border-r p-1",
                !inMonth && "bg-muted/30",
                i % 7 === 6 && "border-r-0",
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday
                      ? "bg-primary font-semibold text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {(isDayOpen ? items : items.slice(0, COLLAPSED_PER_DAY)).map((s) => (
                  <Link
                    key={s.id}
                    href={peekHref(s)}
                    scroll={false}
                    className="flex items-center gap-1 truncate rounded-md bg-muted/60 px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
                    title={`${storyTypeOf(s)} · ${s.title}`}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", STORY_STATUS_META[s.status].fill)} />
                    {/* Type reads at a glance here for the same reason it does
                        in the list: an epic and a bug landing on one day are
                        not the same news. */}
                    <TypeGlyph type={storyTypeOf(s)} className="size-3 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </Link>
                ))}
                {items.length > COLLAPSED_PER_DAY ? (
                  // Was a plain <span>: it announced hidden work and gave no way
                  // to reach it, so those items were simply gone.
                  <button
                    type="button"
                    onClick={() => toggleDay(key)}
                    aria-expanded={isDayOpen}
                    className="rounded px-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {isDayOpen ? "Show less" : `+${items.length - COLLAPSED_PER_DAY} more`}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
