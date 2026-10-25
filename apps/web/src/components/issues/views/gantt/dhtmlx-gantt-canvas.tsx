"use client";

import { useEffect, useRef } from "react";
import { Gantt } from "dhtmlx-gantt";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import "./dhtmlx-gantt-theme.css";

import { STORY_STATUS_META } from "@/constants/story-meta";
import {
  earliestStartMs,
  HEALTH_LABEL,
  isTaskOverdue,
  scheduleHealth,
  startMs,
  taskToDatePatch,
  type IGanttData,
  type IGanttLink,
  type IGanttTask,
} from "@/lib/gantt/dhtmlx-adapter";
import { isCurrentPeriod, zoomConfig, type TGanttZoom } from "@/lib/gantt/gantt-zoom";
import type { EStoryStatus } from "@/types";

type GanttInstance = ReturnType<typeof Gantt.getGanttInstance>;

const fmtStatus = (s: EStoryStatus) => STORY_STATUS_META[s]?.label ?? s;
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (task: IGanttTask) => isTaskOverdue(task, today());
/** dhtmlx templates return raw HTML strings, so task text is escaped at the seam. */
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** dhtmlx grid columns (GIN-350 defaults). Work item stays pinned first. */
function columnsFor(gantt: GanttInstance) {
  const day = (d: Date | null | undefined) => (d ? gantt.date.date_to_str("%M %j")(d) : "—");
  return [
    { name: "text", label: "Work item", tree: true, width: 240, min_width: 160, resize: true },
    {
      name: "gn_status",
      label: "Status",
      align: "center",
      width: 96,
      resize: true,
      template: (t: IGanttTask) => fmtStatus(t.gn_status),
    },
    {
      name: "gn_assignee",
      label: "Assignee",
      align: "center",
      width: 110,
      resize: true,
      template: (t: IGanttTask) => t.gn_assignee || "—",
    },
    {
      name: "start_date",
      label: "Start",
      align: "center",
      width: 80,
      resize: true,
      template: (t: { start_date: Date }) => day(t.start_date),
    },
    {
      name: "gn_due",
      label: "Due",
      align: "center",
      width: 88,
      resize: true,
      template: (t: IGanttTask) => {
        if (t.gn_unscheduled_end) return "—";
        const text = day(gantt.date.str_to_date("%Y-%m-%d")(t.gn_due ?? ""));
        // Overdue is flagged with a glyph as well as the bar colour, so the state
        // survives greyscale, colour-blindness and a printed export.
        return isOverdue(t)
          ? `<span title="Overdue" style="color:var(--destructive);font-weight:600">⚠ ${text}</span>`
          : text;
      },
    },
    {
      name: "duration",
      // "Days" left the reader guessing between calendar and working days; the
      // value is calendar days, so the header says so rather than implying a
      // working-day calculation we do not do.
      label: `<span title="Calendar days, inclusive of start and due">Duration</span>`,
      align: "center",
      width: 76,
      resize: true,
      template: (t: { duration: number }) => `${t.duration}d`,
    },
    {
      name: "gn_health",
      label: `<span title="Schedule health">Health</span>`,
      align: "center",
      width: 64,
      resize: true,
      template: (t: IGanttTask) => {
        const health = scheduleHealth(t, today());
        if (health === "on_track") return "";
        // Glyph + title: the state survives greyscale, colour-blindness and print.
        const glyph = { overdue: "⚠", blocked: "⛔", at_risk: "◐", unassigned: "○" }[health];
        return `<span title="${escapeHtml(HEALTH_LABEL[health])}" aria-label="${escapeHtml(
          HEALTH_LABEL[health],
        )}">${glyph}</span>`;
      },
    },
    {
      name: "progress",
      label: "Progress",
      align: "center",
      width: 74,
      resize: true,
      template: (t: { progress: number }) => `${Math.round((t.progress ?? 0) * 100)}%`,
    },
  ];
}

/**
 * The dhtmlx-gantt canvas (GIN-349/350). Isolated instance per container, torn
 * down on unmount. Phase 2 adds the default grid columns, multi-level zoom
 * scales, weekend shading, a Today marker, and Today/Fit commands; the adapter
 * remains the only data seam. Loaded client-only via next/dynamic({ssr:false}).
 */
const DAY_MS = 86_400_000;

/**
 * Padded visible range for the timeline. dhtmlx otherwise fits exactly to the
 * task span, which — with one short task — leaves a sparse chart with nothing to
 * scroll to. Padding around the data (and today) gives a real, scrollable
 * timeline whose content overflows the viewport at fine zooms.
 */
/**
 * The window is padded generously on BOTH sides of the data (and today) because
 * the range is a hard wall: dhtmlx cannot scroll past `start_date`, so a tight
 * lead-in means "scroll back to last month" is simply impossible. 90 days of
 * runway before and 180 after covers planning either direction at any zoom.
 */
function rangeFor(tasks: IGanttTask[]): { start: Date; end: Date } {
  const now = Date.now();
  let min = now;
  let max = now;
  for (const t of tasks) {
    const s = startMs(t.start_date);
    const e = s + t.duration * DAY_MS;
    if (s < min) min = s;
    if (e > max) max = e;
  }
  return { start: new Date(min - 90 * DAY_MS), end: new Date(max + 180 * DAY_MS) };
}

/**
 * The zoom's scales with a "today" highlight on the finest row — the calendar
 * convention of marking the current date in the header itself, so today is
 * findable while scrolled away from the marker line. Only the bottom row is
 * marked: highlighting the month band too would tint a third of the header.
 */
function scalesFor(zoom: TGanttZoom) {
  const { scales } = zoomConfig(zoom);
  const finest = scales.length - 1;
  return scales.map((row, i) =>
    i === finest
      ? {
          ...row,
          css: (date: Date) =>
            isCurrentPeriod(date, new Date(), row.unit, row.step) ? "gn-gantt-today-head" : "",
        }
      : row,
  );
}

export default function DhtmlxGanttCanvas({
  data,
  zoom,
  todayToken,
  fitToken,
  expandToken,
  readOnly,
  onDateChange,
  onOpenStory,
}: {
  data: IGanttData;
  zoom: TGanttZoom;
  todayToken: number;
  fitToken: number;
  /** Sign carries the intent: >0 expand every parent, <0 collapse every parent. */
  expandToken: number;
  readOnly: boolean;
  onDateChange: (id: string, patch: { start_date: string; target_date: string }) => void;
  onOpenStory: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<GanttInstance | null>(null);
  const dataRef = useRef(data);
  const zoomRef = useRef(zoom);
  const readOnlyRef = useRef(readOnly);
  const onChangeRef = useRef(onDateChange);
  const onOpenStoryRef = useRef(onOpenStory);
  useEffect(() => {
    dataRef.current = data;
    zoomRef.current = zoom;
    readOnlyRef.current = readOnly;
    onChangeRef.current = onDateChange;
    onOpenStoryRef.current = onOpenStory;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const gantt = Gantt.getGanttInstance();
    ganttRef.current = gantt;

    gantt.config.date_format = "%Y-%m-%d";
    // A bar can never be dragged/resized to invert (Due<Start) — this is the
    // drag-side Due<Start guard; inline/backlog edits are guarded in the view.
    gantt.config.min_duration = DAY_MS;
    gantt.config.readonly = readOnlyRef.current;
    // Parents auto-roll up their children's span/progress into a distinct summary
    // bar (GIN-352 hierarchy). Dependents are NEVER shifted silently when a bar
    // moves — auto_scheduling stays off, so a date change is exactly what the user
    // dragged. Dependency arrows are read-only here (relations are edited in the
    // work-item detail), so link drawing is disabled and no cycle can be created.
    //
    // This line predates the work-item-hierarchy branch but only started having
    // an effect here: children never reached the Gantt before (it was fed a flat
    // array with no `parent` links), so no task ever had a child to roll up. Now
    // that it renders `tree.all` with `parent` set, a parent with a scheduled
    // child is reclassified to dhtmlx type `project` — its bar is computed as
    // the span of its children, so the parent's own stored `start_date`/
    // `target_date` stop being what gets drawn. Deliberate (see
    // dhtmlx-gantt-theme.css:155/:401 — "a parent is a rollup, not a piece of
    // work"); do not change.
    //
    // `drag_project` stays at its `false` default on purpose: `onAfterTaskDrag`
    // below persists only the dragged task's id, so letting a parent bar drag
    // would move its children on screen and persist none of them — the drag
    // would evaporate on reload. Enabling it needs a bulk subtree date patch
    // first.
    gantt.config.auto_types = true;
    gantt.config.auto_scheduling = false;
    gantt.config.row_height = 36;
    gantt.config.bar_height = 20;
    gantt.config.scale_height = 54;
    // NOT autosize. Autosizing to the row count makes the widget taller than its
    // wrapper, which pushes dhtmlx's own horizontal scrollbar below the visible
    // area — the reason earlier dates were unreachable. Letting the instance fill
    // a fixed-height box gives it back both scrollbars and a pinned scale header.
    gantt.config.autosize = false;
    // Keep the viewport where the user left it when the task set re-parses,
    // otherwise every optimistic update snaps the timeline back to the start.
    gantt.config.preserve_scroll = true;
    gantt.config.scroll_size = 12;
    // Perf: dhtmlx only paints the visible rows/columns, so 1,000+ items and
    // multi-year ranges stay smooth without our own windowing (GIN-353).
    gantt.config.smart_rendering = true;
    // a11y: arrow-key cell/bar navigation over the grid + timeline. `marker` and
    // `tooltip` are extensions too — without opting in, addMarker is a no-op (the
    // Today line never drew) and bars carry no hover detail.
    gantt.plugins?.({ keyboard_navigation: true, marker: true, tooltip: true });
    // The hierarchy is the point of the tree column, so it starts open. Collapsed
    // parents hide their children's bars, which read as "the chart is empty".
    gantt.config.open_tree_initially = true;
    // Casts bridge our plain configs to dhtmlx's strict Scale/GridColumn tuple
    // types; the runtime shapes match (dhtmlx passes the parsed task with gn_* fields).
    const zc = zoomConfig(zoomRef.current);
    gantt.config.scales = scalesFor(zoomRef.current) as unknown as typeof gantt.config.scales;
    // Fixed column width per zoom so columns render at a readable density instead
    // of stretching to fill the pane (which made the timeline look sparse).
    gantt.config.min_column_width = zc.minColumnWidth;
    gantt.config.columns = columnsFor(gantt) as unknown as typeof gantt.config.columns;
    gantt.config.grid_width = 640;
    gantt.config.grid_resize = true;
    // A padded, explicit range so the timeline is scrollable (not clamped to the
    // single dated task) and reads as a real calendar.
    const range = rangeFor(dataRef.current.data);
    gantt.config.start_date = range.start;
    gantt.config.end_date = range.end;
    // Clicking a work item (grid row or bar) opens our peek sheet, matching the
    // other Work Item views; suppress dhtmlx's built-in lightbox editor entirely.
    gantt.attachEvent("onBeforeLightbox", () => false, undefined);
    // Weekend shading + a full-strength rule on each week/month boundary, so the
    // timeline is a countable grid rather than one even stripe field.
    gantt.templates.timeline_cell_class = (_task: unknown, date: Date) => {
      const classes: string[] = [];
      const d = date.getDay();
      if (d === 0 || d === 6) classes.push("gn-gantt-weekend");
      if (d === 1 || date.getDate() === 1) classes.push("gn-gantt-period");
      const finest = zoomConfig(zoomRef.current).scales.at(-1)!;
      if (isCurrentPeriod(date, new Date(), finest.unit, finest.step)) {
        classes.push("gn-gantt-today-col");
      }
      return classes.join(" ");
    };
    // Bars carry the same status palette as the board/charts, plus an overdue
    // edge. Colour is never the sole cue — the Due column shows the date and the
    // tooltip spells the state out.
    // Casts bridge dhtmlx's base `Task` to our parsed shape (the gn_* passthrough
    // fields), matching the columns/scales casts above.
    gantt.templates.task_class = ((_s: Date, _e: Date, task: IGanttTask) => {
      const classes = [`gn-bar-${task.gn_status}`];
      if (isOverdue(task)) classes.push("gn-bar-overdue");
      const health = scheduleHealth(task, today());
      if (health !== "on_track") classes.push(`gn-bar-health-${health}`);
      return classes.join(" ");
    }) as unknown as typeof gantt.templates.task_class;
    // Progress is drawn *inside* the bar, not only as a number in the grid: a 20%
    // and a 90% bar have to look different at a glance (GIN-379 §8).
    gantt.config.show_progress = true;
    // A one-day bar is a few pixels wide and its label becomes "S..."; putting the
    // code to the right of short bars keeps every bar identifiable (§2).
    gantt.templates.task_text = ((_s: Date, _e: Date, task: IGanttTask) =>
      task.duration >= 3 ? escapeHtml(task.gn_title) : "") as unknown as typeof gantt.templates.task_text;
    gantt.templates.rightside_text = ((_s: Date, _e: Date, task: IGanttTask) =>
      task.duration < 3
        ? escapeHtml(task.gn_code)
        : "") as unknown as typeof gantt.templates.rightside_text;
    gantt.templates.tooltip_text = ((_s: Date, _e: Date, task: IGanttTask) =>
      [
        `<b>${escapeHtml(task.gn_code)}</b> ${escapeHtml(task.gn_title)}`,
        `Status: ${fmtStatus(task.gn_status)}`,
        `Assignee: ${escapeHtml(task.gn_assignee) || "Unassigned"}`,
        `Start: ${gantt.date.date_to_str("%M %j, %Y")(new Date(startMs(task.start_date)))}`,
        `Due: ${task.gn_unscheduled_end ? "not set" : (task.gn_due ?? "—")}`,
        `Progress: ${Math.round((task.progress ?? 0) * 100)}%`,
        `Health: ${HEALTH_LABEL[scheduleHealth(task, today())]}`,
        ...(task.gn_blocked ? ["<b>Blocked</b> by an unfinished dependency"] : []),
      ].join("<br/>")) as unknown as typeof gantt.templates.tooltip_text;
    // Solid arrow for a real dependency, dashed for an informational relation —
    // a `relates_to` implies no ordering, so it must not look like one.
    gantt.templates.link_class = ((link: IGanttLink) =>
      link.gn_kind === "related"
        ? "gn-link-related"
        : "gn-link-blocking") as unknown as typeof gantt.templates.link_class;
    // Truncated grid text stays discoverable via the native title tooltip.
    gantt.templates.grid_row_class = () => "gn-gantt-row";

    gantt.init(el);
    gantt.parse(dataRef.current);
    gantt.addMarker?.({
      start_date: new Date(),
      css: "gn-gantt-today",
      text: "Today",
      title: gantt.date.date_to_str("%F %j, %Y")(new Date()),
    });

    // Open the peek sheet on click (a drag doesn't fire onTaskClick, so this
    // never fights bar drag/resize).
    const clickEvent = gantt.attachEvent(
      "onTaskClick",
      (id: string | number) => {
        onOpenStoryRef.current(String(id));
        return true;
      },
      undefined,
    );

    // Dependency arrows are managed in the work-item detail, not drawn here — so
    // link creation is rejected (which also means no cycle can be introduced).
    const linkGuard = gantt.attachEvent("onBeforeLinkAdd", () => false, undefined);

    const dragEvent = gantt.attachEvent(
      "onAfterTaskDrag",
      (id: string | number, mode: string) => {
        // Only move/resize change dates; progress-handle drags must not persist
        // or pop an undo. dhtmlx exposes the modes on gantt.config.drag_mode.
        const dm = gantt.config.drag_mode;
        if (mode !== dm.move && mode !== dm.resize) return true;
        const t = gantt.getTask(id);
        onChangeRef.current(
          String(id),
          taskToDatePatch({ start_date: t.start_date as Date, end_date: t.end_date as Date }),
        );
        return true;
      },
      undefined,
    );

    // dhtmlx writes an inline pixel height onto this container at init and only
    // re-measures on window resize. That inline style beats our `h-full` class,
    // so the element never grows with its flex parent — collapsing the backlog
    // (or dragging the splitter) left the chart stuck at its old height with
    // dead space beneath it. Watch the PARENT, which does flex, and hand dhtmlx
    // a real number each time.
    const parent = el.parentElement;
    const ro = new ResizeObserver(() => {
      if (parent) el.style.height = `${parent.clientHeight}px`;
      gantt.setSizes?.();
    });
    ro.observe(parent ?? el);

    return () => {
      ro.disconnect();
      gantt.detachEvent(dragEvent);
      gantt.detachEvent(linkGuard);
      gantt.detachEvent(clickEvent);
      gantt.destructor();
      ganttRef.current = null;
    };
  }, []);

  // Re-feed the instance when the scheduled set OR the dependency links change.
  const signature =
    data.data.map((t) => `${t.id}:${t.start_date}:${t.duration}:${t.parent}`).join("|") +
    "#" +
    data.links.map((l) => l.id).join(",");
  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;
    const range = rangeFor(data.data);
    gantt.config.start_date = range.start;
    gantt.config.end_date = range.end;
    gantt.clearAll();
    gantt.parse(data);
    // eslint-disable-next-line react-doctor/exhaustive-deps -- signature captures the task set
  }, [signature]);

  // Toggle read-only live (membership can resolve after first paint).
  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;
    gantt.config.readonly = readOnly;
    gantt.render();
  }, [readOnly]);

  // Apply the selected zoom's multi-level scales.
  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;
    const zc = zoomConfig(zoom);
    gantt.config.scales = scalesFor(zoom) as unknown as typeof gantt.config.scales;
    gantt.config.min_column_width = zc.minColumnWidth;
    gantt.render();
  }, [zoom]);

  // Toolbar commands: scroll Today into view / fit to the earliest scheduled work.
  useEffect(() => {
    if (todayToken === 0) return;
    ganttRef.current?.showDate?.(new Date());
  }, [todayToken]);
  useEffect(() => {
    if (fitToken === 0) return;
    const gantt = ganttRef.current;
    if (!gantt) return;
    // NOT str_to_date: after gantt.parse() these tasks carry Date objects, and
    // dhtmlx's string parser calls .match() on its argument — passing a Date is
    // what threw "t.match is not a function" and blanked the page.
    const earliest = earliestStartMs(data.data);
    if (earliest !== null) gantt.showDate?.(new Date(earliest));
    // eslint-disable-next-line react-doctor/exhaustive-deps -- fires only on the fit command
  }, [fitToken]);

  // Expand / collapse the whole tree at once — with deep epic→story→task nesting,
  // opening parents one arrow at a time is the slowest part of reading the chart.
  useEffect(() => {
    if (expandToken === 0) return;
    const gantt = ganttRef.current;
    if (!gantt) return;
    gantt.eachTask?.((task: { id: string | number }) => {
      if (gantt.hasChild?.(task.id)) {
        if (expandToken > 0) gantt.open?.(task.id);
        else gantt.close?.(task.id);
      }
    });
  }, [expandToken]);

  // h-full: the instance owns its own scrollbars, so it must be given a real box
  // to fill. A height-less container is what hid the horizontal scrollbar.
  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="application"
      aria-label="Work item timeline"
    />
  );
}
