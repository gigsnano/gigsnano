import type { THealth } from "../types/briefing";

export type TTone = "default" | "muted" | "primary" | "success" | "warning" | "destructive";

export const HEALTH_DISPLAY: Record<THealth, { label: string; tone: TTone }> = {
  on_track: { label: "On track", tone: "success" },
  at_risk: { label: "At risk", tone: "warning" },
  off_track: { label: "Off track", tone: "destructive" },
  no_data: { label: "No forecast", tone: "muted" },
};

export function isAtRisk(health: THealth): boolean {
  return health === "at_risk" || health === "off_track";
}
