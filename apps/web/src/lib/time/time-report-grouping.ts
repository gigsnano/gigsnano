import type { ITimeReportEntry } from "@/types";

export interface IPersonTotal {
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  total_hours: number;
  entry_count: number;
}

export interface IWorkItemTotal {
  story_id: string;
  story_code: string;
  story_title: string;
  project_name: string;
  total_hours: number;
  contributor_count: number;
}

/** GIN-58 — total hours per person, descending by hours. */
export function groupByPerson(entries: ITimeReportEntry[]): IPersonTotal[] {
  const map = new Map<string, IPersonTotal>();
  for (const e of entries) {
    const key = e.user_id ?? "unknown";
    const row = map.get(key);
    if (row) {
      row.total_hours += e.hours;
      row.entry_count += 1;
    } else {
      map.set(key, {
        user_id: key,
        user_name: e.user_name,
        user_avatar_url: e.user_avatar_url,
        total_hours: e.hours,
        entry_count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.total_hours - a.total_hours);
}

/** GIN-59 — total hours per work item, descending by hours. */
export function groupByWorkItem(entries: ITimeReportEntry[]): IWorkItemTotal[] {
  const map = new Map<string, IWorkItemTotal & { contributors: Set<string> }>();
  for (const e of entries) {
    const row = map.get(e.story_id);
    if (row) {
      row.total_hours += e.hours;
      row.contributors.add(e.user_id ?? "unknown");
    } else {
      map.set(e.story_id, {
        story_id: e.story_id,
        story_code: e.story_code,
        story_title: e.story_title,
        project_name: e.project_name,
        total_hours: e.hours,
        contributor_count: 0,
        contributors: new Set([e.user_id ?? "unknown"]),
      });
    }
  }
  return [...map.values()]
    .map(({ contributors, ...rest }) => ({
      ...rest,
      contributor_count: contributors.size,
    }))
    .sort((a, b) => b.total_hours - a.total_hours);
}

export const totalHours = (entries: ITimeReportEntry[]): number =>
  entries.reduce((sum, e) => sum + e.hours, 0);
