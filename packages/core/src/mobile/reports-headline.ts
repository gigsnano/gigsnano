import type { IReports } from "../types/reports";

/** "18 done · 82% on time · 3 at risk"; the on-time clause reads "on-time n/a" without a value. */
export function reportsHeadline(r: IReports): string {
  const onTime = r.on_time.pct === null ? "on-time n/a" : `${r.on_time.pct}% on time`;
  const atRisk = r.at_risk.at_risk + r.at_risk.off_track;
  return `${r.throughput.total} done · ${onTime} · ${atRisk} at risk`;
}

/** Rounded percent change from prev to cur; null when there is no baseline. */
export function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function formatDelta(delta: number | null): string {
  if (delta === null || delta === 0) return "—";
  return delta > 0 ? `↑${delta}%` : `↓${Math.abs(delta)}%`;
}
