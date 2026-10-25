import type { IProjectEstimate } from "@/types";

/** Canonical estimate-scale values by type. Shared by the manual estimate picker
 * and the AI suggestion control (GIN-332) so they never drift. */
export const POINT_VALUES = [1, 2, 3, 5, 8, 13, 21];
export const HOUR_VALUES = [1, 2, 4, 8, 16, 24, 40];
export const DAY_VALUES = [0.5, 1, 2, 3, 5, 8];

export function valuesForType(type: IProjectEstimate["type"]): number[] {
  if (type === "hours") return HOUR_VALUES;
  if (type === "days") return DAY_VALUES;
  return POINT_VALUES;
}

export function formatPoints(points: number, type: IProjectEstimate["type"]): string {
  if (type === "days") return `${points}d`;
  if (type === "hours") return `${points}h`;
  return String(points);
}

/** Preset durations (minutes) for the "time" planning method (GIN-331). Common
 * increments so entry stays valid without free-text; the column stores minutes. */
export const DURATION_PRESETS_MIN = [15, 30, 60, 120, 240, 480, 960, 1440, 2400];

/** Minutes → a compact label. Sub-hour shows minutes; up to a day shows hours;
 * beyond that shows workdays (8h/day). Never invents precision (integers stay
 * integers). */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 480) {
    const h = minutes / 60;
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  const days = minutes / 480;
  return Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`;
}
