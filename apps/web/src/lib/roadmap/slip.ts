import type { TSlipSignal } from "@/types";

/** Display metadata per slip signal (tokenized, theme-aware). */
export const SLIP_META: Record<TSlipSignal, { label: string; chip: string }> = {
  on_track: {
    label: "On track",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  },
  at_risk: {
    label: "At risk",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
  },
  off_track: {
    label: "Off track",
    chip: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  },
};

const DAY = 86_400_000;

/**
 * Schedule-slip heuristic, ported from the backend (roadmap/service.py slip_band):
 * open items vs days-to-target, ~1 item/day of capacity. Pure so the mock + a
 * test share it. `today`/`targetDate` are date-only (midnight).
 */
export function slipBand(
  total: number,
  done: number,
  targetDate: string | null,
  today: Date,
): { signal: TSlipSignal; reason: string } {
  const open = total - done;
  if (total === 0) return { signal: "on_track", reason: "No linked work yet." };
  if (open <= 0) return { signal: "on_track", reason: "All linked work is done." };
  if (!targetDate) return { signal: "on_track", reason: `${open} open item(s), no target date set.` };
  const days = Math.round((new Date(`${targetDate}T00:00:00`).getTime() - today.getTime()) / DAY);
  if (days < 0) return { signal: "off_track", reason: `${open} open item(s), ${-days}d overdue.` };
  if (open > days) return { signal: "at_risk", reason: `${open} open item(s) with only ${days}d left.` };
  return { signal: "on_track", reason: `${open} open item(s), ${days}d left.` };
}
