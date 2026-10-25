// src/components/projects/views/gantt/projects-gantt.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { IProject } from "@/types";

import { EGanttZoom, GANTT_VIEWS, GANTT_ZOOM_ORDER } from "./gantt-config";
import {
  buildDayColumns,
  buildWeekColumns,
  getBarPosition,
  getChartRange,
  getTodayOffset,
  groupDaysByMonth,
  groupWeeksByMonth,
} from "./gantt-date-math";
import { GanttHeader } from "./gantt-header";
import { GanttSidebar } from "./gantt-sidebar";
import { GanttBarRow } from "./gantt-bar-row";

/** Plane-style read-only projects Gantt. Drop-in replacement for ProjectsTimeline. */
export function ProjectsGantt({
  projects,
  workspaceSlug,
}: {
  projects: IProject[];
  workspaceSlug: string;
}) {
  const [zoom, setZoom] = useState<EGanttZoom>(EGanttZoom.Week);
  const scrollRef = useRef<HTMLDivElement>(null);

  const view = GANTT_VIEWS[zoom];
  const isWeek = zoom === EGanttZoom.Week;
  const { chartStart, totalDays } = getChartRange(projects, view.paddingDays);
  const chartWidth = totalDays * view.dayWidth;
  const dayColumns = isWeek ? buildDayColumns(chartStart, totalDays) : undefined;
  const weekColumns = isWeek ? undefined : buildWeekColumns(chartStart, totalDays);
  const monthGroups = isWeek
    ? groupDaysByMonth(dayColumns!)
    : groupWeeksByMonth(weekColumns!);
  const todayOffset = getTodayOffset(chartStart, totalDays, view.dayWidth);
  const rows = projects.map((project) => ({
    project,
    ...getBarPosition(project, chartStart, view.dayWidth),
  }));

  // Scroll so today is ~240px from the left, on mount and whenever zoom changes.
  useEffect(() => {
    if (scrollRef.current && todayOffset != null) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 240);
    }
  }, [zoom, todayOffset]);

  return (
    <div className="flex flex-col gap-3">
      {/* Sub-toolbar: count + zoom */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? "Project" : "Projects"}
        </span>
        <div className="flex items-center rounded-md border bg-input/30 p-0.5">
          {GANTT_ZOOM_ORDER.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
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

      {/* Chart: fixed sidebar + horizontally-scrollable calendar */}
      <div className="flex overflow-hidden rounded-lg border">
        <GanttSidebar projects={projects} workspaceSlug={workspaceSlug} />
        <div ref={scrollRef} className="flex-1 overflow-x-auto">
          <div className="relative" style={{ width: chartWidth }}>
            <GanttHeader
              zoom={zoom}
              monthGroups={monthGroups}
              dayColumns={dayColumns}
              weekColumns={weekColumns}
              dayWidth={view.dayWidth}
            />
            <div className="relative">
              {rows.map(({ project, left, width }) => (
                <GanttBarRow
                  key={project.id}
                  project={project}
                  left={left}
                  width={width}
                  workspaceSlug={workspaceSlug}
                />
              ))}
              {todayOffset != null ? (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary/70"
                  style={{ left: todayOffset }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
