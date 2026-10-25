"use client";

import { HEALTH_LABEL, scheduleHealth, type IGanttTask } from "@/lib/gantt/dhtmlx-adapter";
import { STORY_STATUS_META } from "@/constants/story-meta";
import { EStoryStatus } from "@/types";

/**
 * What the timeline's colours and shapes mean, and how much of the plan is in
 * trouble (GIN-379 §7 + §12).
 *
 * Two jobs in one strip because they answer the same question — "is this chart
 * telling me something bad?" A legend nobody can find is a legend nobody reads,
 * so it sits with the counts rather than behind a menu.
 *
 * Every state carries a glyph and a word, never colour alone: the chart has to
 * survive greyscale, colour-blindness and a printed export.
 */

const HEALTH_GLYPH = {
  overdue: "⚠",
  blocked: "⛔",
  at_risk: "◐",
  unassigned: "○",
} as const;

const HEALTH_ORDER = ["overdue", "blocked", "at_risk", "unassigned"] as const;

const STATUS_ORDER = [
  EStoryStatus.Todo,
  EStoryStatus.InProgress,
  EStoryStatus.InReview,
  EStoryStatus.Done,
] as const;

export function GanttLegend({ tasks }: { tasks: IGanttTask[] }) {
  // Loaded client-only (see the dynamic import in the view), so reading the clock
  // here cannot produce a server/client mismatch.
  const today = new Date().toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const health = scheduleHealth(task, today);
    if (health !== "on_track") counts.set(health, (counts.get(health) ?? 0) + 1);
  }
  const problems = HEALTH_ORDER.filter((h) => counts.get(h));

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2 text-xs"
      aria-label="Timeline legend and schedule health"
    >
      <div className="flex items-center gap-3">
        {STATUS_ORDER.map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className={`gn-legend-swatch gn-bar-${status}`}
              aria-hidden
            />
            {STORY_STATUS_META[status]?.label ?? status}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="gn-legend-diamond" aria-hidden />
          Milestone
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="gn-legend-summary" aria-hidden />
          Summary (rolled up)
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {problems.length === 0 ? (
          <span className="text-muted-foreground">No schedule problems</span>
        ) : (
          problems.map((health) => (
            <span
              key={health}
              className="flex items-center gap-1.5 font-medium"
              title={HEALTH_LABEL[health]}
            >
              <span aria-hidden>{HEALTH_GLYPH[health]}</span>
              {/* The number and the word together: an icon with a count still
                  needs saying out loud for a screen reader. */}
              <span className="sr-only">{HEALTH_LABEL[health]}: </span>
              {counts.get(health)}{" "}
              <span className="font-normal text-muted-foreground">
                {health === "at_risk" ? "at risk" : health}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
