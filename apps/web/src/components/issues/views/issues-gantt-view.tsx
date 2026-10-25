"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { sortStories } from "@/lib/issues/story-sort";
import { buildGanttExportModel } from "@/lib/gantt/gantt-export-model";
import { virtualWindow } from "@/lib/gantt/virtual-window";
import { downloadGanttWorkbook } from "@/lib/gantt/write-gantt-workbook";
import { useUpdateStory } from "@/hooks/story/use-stories";
import type { IIssuesData } from "@/hooks/issues/use-issues-data";
import type { IStory } from "@/types";
import {
  EGanttZoom,
  GANTT_HEADER_HEIGHT,
  GANTT_ROW_HEIGHT,
  GANTT_SIDEBAR_CSS_WIDTH,
  GANTT_VIEWS,
  GANTT_ZOOM_ORDER,
} from "@/components/projects/views/gantt/gantt-config";
import {
  buildDayColumns,
  buildWeekColumns,
  getChartRange,
  getTodayOffset,
  groupDaysByMonth,
  groupWeeksByMonth,
} from "@/components/projects/views/gantt/gantt-date-math";
import { GanttHeader } from "@/components/projects/views/gantt/gantt-header";
import { IssuesGanttChartRow, IssuesGanttSidebarRow } from "@/components/issues/gantt/issues-gantt-row";
import type { TGanttDatePatch } from "@/components/issues/gantt/use-issues-gantt-bar-drag";

/** Plane: a block is on the chart when either date is set. */
function hasTimelineDate(story: IStory) {
  return Boolean(story.start_date || story.target_date);
}

/**
 * Plane-style work-item Gantt (`showAllBlocks`): every item in the sticky left
 * rail; undated rows get click-to-schedule; half-block drag rules; Today recenter.
 */
export function IssuesGanttView({
  workspaceSlug,
  projectId,
  data,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  data: IIssuesData;
  cycleId?: string;
}) {
  const { stories, project } = data;
  const identifier = project?.identifier ?? "";
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState<EGanttZoom>(EGanttZoom.Week);
  const [todayTick, setTodayTick] = useState(0);
  const [exporting, setExporting] = useState(false);
  // Drives row virtualisation (GIN-119). Tracked together so one scroll is one
  // state write rather than two.
  const [scroll, setScroll] = useState({ top: 0, height: 0 });
  const view = GANTT_VIEWS[zoom];
  const isWeek = zoom === EGanttZoom.Week;

  const allStories = sortStories(stories, []);
  const datedStories = allStories.filter(hasTimelineDate);

  const { chartStart, totalDays } = getChartRange(
    datedStories.map((s) => ({
      start_date: s.start_date,
      target_date: s.target_date,
    })),
    view.paddingDays,
  );

  const chartWidth = totalDays * view.dayWidth;
  const dayColumns = isWeek ? buildDayColumns(chartStart, totalDays) : undefined;
  const weekColumns = isWeek ? undefined : buildWeekColumns(chartStart, totalDays);
  const monthGroups = isWeek
    ? groupDaysByMonth(dayColumns!)
    : groupWeeksByMonth(weekColumns!);
  const todayOffset = getTodayOffset(chartStart, totalDays, view.dayWidth);

  useEffect(() => {
    if (scrollRef.current && todayOffset != null) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 240);
    }
  }, [zoom, todayOffset, todayTick]);

  // Viewport height for the row window. ResizeObserver rather than a one-off
  // measure: the pane is resizable and the window must follow it. The callback
  // fires on observe(), so the first real height lands before paint.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setScroll((s) => (s.height === el.clientHeight ? s : { ...s, height: el.clientHeight }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) setScroll((s) => (s.top === el.scrollTop ? s : { ...s, top: el.scrollTop }));
  };

  // One window drives BOTH columns — computing them separately would let the
  // sidebar rail and the chart rows drift out of alignment.
  const { first, last, padTop, padBottom } = virtualWindow({
    total: allStories.length,
    scrollTop: scroll.top,
    viewportHeight: scroll.height,
    rowHeight: GANTT_ROW_HEIGHT,
    headerHeight: GANTT_HEADER_HEIGHT,
  });
  const visibleStories = allStories.slice(first, last);

  const handleSchedule = (storyId: string, patch: TGanttDatePatch) => {
    updateStory.mutate({ storyId, patch });
  };

  // Export exactly what the Gantt renders — the same filtered + ordered stories,
  // at the current zoom — into a Gantt-formatted .xlsx (GIN-84). `.finally()`
  // (not try/finally) so React Compiler can lower it.
  const handleExport = () => {
    if (exporting || allStories.length === 0) return;
    setExporting(true);
    const model = buildGanttExportModel({
      stories: allStories,
      zoom,
      getAssigneeName: (id) => (id ? data.assignees.get(id)?.display_name ?? "" : ""),
      getCode: (s) =>
        s.code ?? (s.story_number != null && identifier ? `${identifier}-${s.story_number}` : s.id.slice(0, 8)),
    });
    downloadGanttWorkbook(model, {
      title: `${project?.name ?? "Project"} — Gantt`,
      date: new Date().toISOString().slice(0, 10),
    }).finally(() => setExporting(false));
  };

  const unscheduledCount = allStories.length - datedStories.length;

  return (
    <div className="gn-board-surface t-view-swap h-full min-h-0">
      {/* Wraps on narrow columns so the zoom control drops below the count
          instead of running past the edge. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {allStories.length} work items
          {unscheduledCount ? (
            <span className="text-muted-foreground/70">
              {" "}
              · {unscheduledCount} unscheduled — hover + click to schedule
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || allStories.length === 0}
            aria-label="Export Gantt to Excel"
            title="Export Gantt to Excel"
          >
            {exporting ? (
              <span
                aria-hidden="true"
                className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground"
              />
            ) : (
              <HugeiconsIcon icon={Download04Icon} className="size-4" />
            )}
            <span className="max-sm:sr-only">{exporting ? "Exporting…" : "Export"}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setTodayTick((n) => n + 1)}
          >
            Today
          </Button>
          <div className="flex items-center rounded-md border bg-input/30 p-0.5">
            {GANTT_ZOOM_ORDER.map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => setZoom(z)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 active:scale-[0.97]",
                  zoom === z
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {GANTT_VIEWS[z].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-auto">
          <div className="flex min-w-max">
            <div
              // Above the chart's sticky date header (z-10), which scrolls under it.
              className="sticky left-0 z-[11] shrink-0 border-r bg-background"
              style={{ width: GANTT_SIDEBAR_CSS_WIDTH }}
            >
              <div
                className="sticky top-0 z-[3] flex items-center justify-between border-b bg-background px-3 text-xs font-medium text-muted-foreground"
                style={{ height: GANTT_HEADER_HEIGHT }}
              >
                <span>Work item</span>
                <span>Duration</span>
              </div>
              <div aria-hidden style={{ height: padTop }} />
              {visibleStories.map((story) => (
                <IssuesGanttSidebarRow key={story.id} story={story} identifier={identifier} />
              ))}
              <div aria-hidden style={{ height: padBottom }} />
            </div>

            <div className="relative shrink-0" style={{ width: chartWidth }}>
              <GanttHeader
                zoom={zoom}
                monthGroups={monthGroups}
                dayColumns={dayColumns}
                weekColumns={weekColumns}
                dayWidth={view.dayWidth}
              />
              <div className="relative">
                <div aria-hidden style={{ height: padTop }} />
                {visibleStories.map((story) => (
                  <IssuesGanttChartRow
                    key={story.id}
                    story={story}
                    chartStart={chartStart}
                    dayWidth={view.dayWidth}
                    chartWidth={chartWidth}
                    addBlockSpanDays={view.addBlockSpanDays}
                    onSchedule={handleSchedule}
                  />
                ))}
                <div aria-hidden style={{ height: padBottom }} />
                {todayOffset != null ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-primary/60"
                    style={{ left: todayOffset }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
