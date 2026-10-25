"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Download04Icon,
  UnfoldLessIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { isScheduled, isDueBeforeStart, storiesToGanttData } from "@/lib/gantt/dhtmlx-adapter";
import { GANTT_ZOOM_LABEL, GANTT_ZOOM_LEVELS, type TGanttZoom } from "@/lib/gantt/gantt-zoom";
import { buildGanttExportModel } from "@/lib/gantt/gantt-export-model";
import { downloadGanttWorkbook } from "@/lib/gantt/write-gantt-workbook";
import { EGanttZoom } from "@/components/projects/views/gantt/gantt-config";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { useProjectRelations } from "@/hooks/story/use-story-detail";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { peekHref } from "@/lib/issues/issue-routes";
import type { IIssuesData } from "@/hooks/issues/use-issues-data";
import { EMemberStatus, EWorkspaceRole, type IStory } from "@/types";
import { Button } from "@/components/ui/button";
import { GanttBacklog, type IGanttSchedulePatch } from "./gantt-backlog";
import { clampTimelineHeight } from "@/lib/gantt/splitter-geometry";
import { GanttSplitter } from "./gantt-splitter";

// The dhtmlx zoom set is finer than the Excel export's; map to the nearest
// export scale so a reused GIN-84 workbook stays readable at any Gantt zoom.
const EXPORT_ZOOM: Record<TGanttZoom, EGanttZoom> = {
  day: EGanttZoom.Week,
  week: EGanttZoom.Week,
  month: EGanttZoom.Month,
  quarter: EGanttZoom.Quarter,
  year: EGanttZoom.Quarter,
};

// dhtmlx is browser-only + heavy — load the canvas client-side on demand so it
// never enters the SSR bundle and only loads when the flag routes here (GIN-349).
// Client-only for the same reason as the canvas: it reads *today*, and a date
// computed during a server render is a different day than the browser's when the
// two straddle midnight (or a timezone) — a hydration mismatch by construction.
const GanttLegend = dynamic(() => import("./gantt-legend").then((m) => m.GanttLegend), {
  ssr: false,
});

const DhtmlxGanttCanvas = dynamic(() => import("./dhtmlx-gantt-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading timeline…
    </div>
  ),
});

/** The undo/error strip shown after a schedule action (no toast lib in-app). */
type TNotice =
  | { kind: "undo"; code: string; storyId: string; prev: IGanttSchedulePatch }
  | { kind: "error"; message: string };

/**
 * dhtmlx-gantt-backed Work Items Gantt (GIN-349..351). Owns the GigsNano chrome —
 * zoom/navigation toolbar, the unscheduled backlog, and the scheduling seam. Every
 * date write (bar drag/resize from the canvas, inline/bulk schedule from the
 * backlog) routes through one guarded handler: it rejects Due<Start, remembers the
 * prior dates for undo, and relies on `useUpdateStory`'s optimistic + rollback.
 * Read-only mode (workspace Guests / non-members) hides every editor.
 */
export function DhtmlxGanttView({
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
  const router = useRouter();
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);
  const { data: relations } = useProjectRelations(workspaceSlug, projectId);
  const { data: user } = useAuthUser();
  const { data: members } = useMembers(workspaceSlug);
  const me = members?.find((m) => m.user_id === user?.id && m.status === EMemberStatus.Active);
  // Default editable while membership loads; a real Guest's write is also rejected
  // server-side. Enforcement here is the UI affordance, not the security boundary.
  const readOnly = Boolean(members) && (!me || me.role === EWorkspaceRole.Guest);

  const identifier = data.project?.identifier ?? "";
  const zoom = useIssuesViewStore((s) => s.ganttZoom);
  const setZoom = useIssuesViewStore((s) => s.setGanttZoom);
  const [todayToken, setTodayToken] = useState(0);
  const [fitToken, setFitToken] = useState(0);
  // Sign is the intent (+expand / −collapse); magnitude just makes it change.
  const [expandToken, setExpandToken] = useState(0);
  const [treeOpen, setTreeOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [notice, setNotice] = useState<TNotice | null>(null);

  // Splitter geometry. `available` is the shell's height, measured so the drag
  // clamp knows how much room the two panes actually share.
  const shellRef = useRef<HTMLDivElement>(null);
  const timelineHeight = useIssuesViewStore((s) => s.ganttTimelineHeight);
  const setTimelineHeight = useIssuesViewStore((s) => s.setGanttTimelineHeight);
  const [available, setAvailable] = useState(720);
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-dismiss the strip so it never lingers over the timeline.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const getCode = (s: IStory) =>
    s.code ??
    (s.story_number != null && identifier ? `${identifier}-${s.story_number}` : s.id.slice(0, 8));
  const getAssigneeName = (s: IStory) =>
    s.assignee_id ? (data.assignees.get(s.assignee_id)?.display_name ?? "") : "";

  // dhtmlx builds the tree itself from each task's `parent`, so it takes every
  // matching item rather than `tree.rows` — `rows` would strip the children the
  // grid is meant to indent.
  const ganttStories = data.tree.all;
  const ganttData = storiesToGanttData(
    ganttStories,
    getCode,
    getAssigneeName,
    relations ?? [],
    data.treeMode === "nested",
  );
  const unscheduled = ganttStories.filter((s) => !isScheduled(s));
  const scheduled = ganttData.data.length;
  // Only offer the tree control when there IS a hierarchy — an all-flat project
  // shouldn't carry a button that does nothing.
  const hasTree = ganttData.data.some((t) => t.parent !== 0);
  // The splitter only exists while both panes do.
  const splitTimeline = scheduled > 0 && unscheduled.length > 0 && !backlogCollapsed;
  const clampedHeight = clampTimelineHeight(timelineHeight, available);

  // The one guarded write. `patch` is a partial ({start_date?} / {target_date?} /
  // both); it's merged onto the story's current dates before validating so a
  // single-field schedule can't be judged against a missing counterpart.
  const applyDates = (storyId: string, patch: IGanttSchedulePatch) => {
    if (readOnly) return;
    const story = ganttStories.find((s) => s.id === storyId);
    if (!story) return;
    const nextStart = "start_date" in patch ? patch.start_date ?? null : story.start_date;
    const nextDue = "target_date" in patch ? patch.target_date ?? null : story.target_date;
    if (isDueBeforeStart(nextStart, nextDue)) {
      setNotice({ kind: "error", message: `${getCode(story)}: due date can't be before start date` });
      return;
    }
    setNotice({
      kind: "undo",
      code: getCode(story),
      storyId,
      prev: { start_date: story.start_date, target_date: story.target_date },
    });
    updateStory.mutate({ storyId, patch });
  };

  const undo = () => {
    if (notice?.kind !== "undo") return;
    updateStory.mutate({ storyId: notice.storyId, patch: notice.prev });
    setNotice(null);
  };

  // Reuse the GIN-84 Excel export — the workbook includes every item (unscheduled
  // rows export bar-less), so nothing is dropped. `.finally()` (not try/finally)
  // so React Compiler can lower it.
  const handleExport = () => {
    if (exporting || ganttStories.length === 0) return;
    setExporting(true);
    const model = buildGanttExportModel({
      stories: ganttStories,
      zoom: EXPORT_ZOOM[zoom],
      getAssigneeName: (id) => (id ? data.assignees.get(id)?.display_name ?? "" : ""),
      getCode,
    });
    downloadGanttWorkbook(model, {
      title: `${data.project?.name ?? "Project"} — Gantt`,
      date: new Date().toISOString().slice(0, 10),
    }).finally(() => setExporting(false));
  };

  return (
    <div ref={shellRef} className="gn-board-surface t-view-swap flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {scheduled} scheduled
          {unscheduled.length ? (
            <span className="text-muted-foreground/70"> · {unscheduled.length} unscheduled</span>
          ) : null}
          {readOnly ? <span className="text-muted-foreground/70"> · read-only</span> : null}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || ganttStories.length === 0}
            aria-label="Export Gantt to Excel (includes unscheduled items)"
            title="Export Gantt to Excel — includes unscheduled items"
          >
            {exporting ? (
              <span
                aria-hidden="true"
                className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground"
              />
            ) : (
              <HugeiconsIcon icon={Download04Icon} className="size-4" />
            )}
            {exporting ? "Exporting…" : "Export"}
          </Button>
          {hasTree ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setExpandToken((n) => (treeOpen ? -Math.abs(n) - 1 : Math.abs(n) + 1));
                setTreeOpen((o) => !o);
              }}
              aria-label={treeOpen ? "Collapse all parents" : "Expand all parents"}
              title={treeOpen ? "Collapse all parents" : "Expand all parents"}
            >
              <HugeiconsIcon
                icon={treeOpen ? UnfoldLessIcon : UnfoldMoreIcon}
                className="size-4"
              />
              {treeOpen ? "Collapse" : "Expand"}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => setFitToken((n) => n + 1)}>
            Fit
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setTodayToken((n) => n + 1)}>
            Today
          </Button>
          <div className="flex items-center rounded-md border bg-input/30 p-0.5">
            {GANTT_ZOOM_LEVELS.map((z) => (
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
                {GANTT_ZOOM_LABEL[z]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {scheduled === 0 ? (
        <div className="shrink-0 px-4 py-3 text-center text-sm text-muted-foreground">
          Nothing scheduled yet —{" "}
          {readOnly
            ? "these work items have no dates."
            : "schedule work from the backlog below to place it on the timeline."}
        </div>
      ) : (
        // The canvas gets a REAL box (fixed px when the backlog shares the view,
        // otherwise all remaining space) and never an `overflow` wrapper: dhtmlx
        // draws its own scrollbars inside, and wrapping it in a scroll container
        // pushed the horizontal bar out of sight — which is why earlier dates
        // were unreachable. The height is the splitter's to set.
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            splitTimeline ? "shrink-0" : "flex-1",
          )}
          style={splitTimeline ? { height: clampedHeight } : undefined}
        >
          {/* What the colours mean and how much is in trouble, above the chart
              rather than behind a menu — a legend nobody finds is not a legend. */}
          <GanttLegend tasks={ganttData.data} />
          <div className="min-h-0 flex-1">
          <DhtmlxGanttCanvas
            data={ganttData}
            zoom={zoom}
            todayToken={todayToken}
            fitToken={fitToken}
            expandToken={expandToken}
            readOnly={readOnly}
            onDateChange={(storyId, patch) => applyDates(storyId, patch)}
            onOpenStory={(storyId) => router.push(peekHref({ id: storyId }), { scroll: false })}
          />
          </div>
        </div>
      )}

      {splitTimeline ? (
        <GanttSplitter
          height={clampedHeight}
          available={available}
          onResize={setTimelineHeight}
        />
      ) : null}

      {notice ? (
        <div
          role="status"
          className="flex shrink-0 items-center gap-3 border-t bg-background px-4 py-2 text-sm"
        >
          {notice.kind === "undo" ? (
            <>
              <span className="text-muted-foreground">Rescheduled {notice.code}.</span>
              <button
                type="button"
                onClick={undo}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Undo
              </button>
            </>
          ) : (
            <span className="text-destructive">{notice.message}</span>
          )}
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        </div>
      ) : null}

      <GanttBacklog
        stories={unscheduled}
        getCode={getCode}
        readOnly={readOnly}
        collapsed={backlogCollapsed}
        onToggleCollapsed={() => setBacklogCollapsed((c) => !c)}
        onSchedule={applyDates}
        onOpenStory={(storyId) => router.push(peekHref({ id: storyId }), { scroll: false })}
      />
    </div>
  );
}
