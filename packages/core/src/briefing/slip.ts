import type { IBriefingProject } from "../types/briefing";
import type { TTone } from "./health";

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatSlip(
  project: Pick<IBriefingProject, "slip_days" | "forecast_date">,
): { text: string; tone: TTone } {
  if (project.forecast_date === null || project.slip_days === null) return { text: "—", tone: "muted" };
  if (project.slip_days > 0) return { text: `+${project.slip_days}d`, tone: "warning" };
  return { text: DAY_MONTH.format(new Date(project.forecast_date)), tone: "default" };
}
