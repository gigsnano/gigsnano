import { ECycleStatus, type ICycle } from "@/types";

/** The three buckets the Cycles page groups sprints into. */
export type TCyclePhase = "active" | "upcoming" | "completed";

/** UTC calendar-day index, so date-only strings (`YYYY-MM-DD`) and full ISO
 *  timestamps compare at day granularity without timezone drift. */
function dayNumber(value: string | Date): number {
  const d = typeof value === "string" ? new Date(value) : value;
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000,
  );
}

/**
 * Classify a cycle as active / upcoming / completed from its **date range**,
 * not just its stored status (GIN-81: a cycle whose range contains today was
 * bucketed as "upcoming" because it went by the stored status alone).
 *
 * Rules, in order:
 *  1. An explicitly Completed cycle stays completed (respects manual completion).
 *  2. Before its start date → upcoming.
 *  3. After its end date → completed.
 *  4. Otherwise, if it has any date bound → active (today is within the window).
 *  5. No dates at all → fall back to the stored status.
 *
 * `now` is injected for testability; callers pass `new Date()`.
 */
export function cyclePhase(
  cycle: Pick<ICycle, "status" | "start_date" | "end_date">,
  now: Date,
): TCyclePhase {
  if (cycle.status === ECycleStatus.Completed) return "completed";

  const today = dayNumber(now);
  const start = cycle.start_date ? dayNumber(cycle.start_date) : null;
  const end = cycle.end_date ? dayNumber(cycle.end_date) : null;

  if (start !== null && today < start) return "upcoming";
  if (end !== null && today > end) return "completed";
  if (start !== null || end !== null) return "active";

  return cycle.status === ECycleStatus.Active ? "active" : "upcoming";
}
