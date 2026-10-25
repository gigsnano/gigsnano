import type { ICycle, ICycleProgress, IBurndownPoint, ICycleAssigneeStat } from "@/types";
import { ECycleStateGroup, EStoryStatus } from "@/types";
import type { IStory } from "@/types";

const MS_PER_DAY = 86_400_000;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * MS_PER_DAY);
const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** GigsNano's 4 statuses map onto Plane's stategroups. */
function groupForStatus(status: EStoryStatus): ECycleStateGroup {
  switch (status) {
    case EStoryStatus.Done:
      return ECycleStateGroup.Completed;
    case EStoryStatus.InProgress:
    case EStoryStatus.InReview:
      return ECycleStateGroup.Started;
    case EStoryStatus.Todo:
    default:
      return ECycleStateGroup.Unstarted;
  }
}

/** Deterministic given (cycle, stories, today). `today` is YYYY-MM-DD. */
export function buildCycleProgress(cycle: ICycle, stories: IStory[], today: string): ICycleProgress {
  const scope = stories.length;

  const counts: Record<ECycleStateGroup, number> = {
    [ECycleStateGroup.Completed]: 0,
    [ECycleStateGroup.Started]: 0,
    [ECycleStateGroup.Unstarted]: 0,
    [ECycleStateGroup.Backlog]: 0,
    [ECycleStateGroup.Cancelled]: 0,
  };
  for (const s of stories) counts[groupForStatus(s.status)] += 1;

  const completed = counts[ECycleStateGroup.Completed];
  const pendingNow = scope - completed;

  const start = toDate(cycle.start_date ?? today);
  const end = cycle.end_date ? toDate(cycle.end_date) : addDays(start, 14);
  const totalDays = Math.max(1, daysBetween(start, end));
  const todayIdx = clamp(daysBetween(start, toDate(today)), 0, totalDays);

  const burndown: IBurndownPoint[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const ideal = +(scope * (1 - i / totalDays)).toFixed(2);
    let pending: number | null = null;
    if (i <= todayIdx) {
      const t = todayIdx === 0 ? 0 : i / todayIdx;
      pending = Math.round(scope + (pendingNow - scope) * t);
    }
    burndown.push({ date: fmt(addDays(start, i)), scope, ideal, pending });
  }

  const idealPendingToday = scope * (1 - todayIdx / totalDays);
  const leading_by = Math.round(idealPendingToday) - pendingNow;

  const byAssignee = new Map<string, ICycleAssigneeStat>();
  for (const s of stories) {
    if (!s.assignee_id) continue;
    const stat = byAssignee.get(s.assignee_id) ?? { user_id: s.assignee_id, completed: 0, total: 0 };
    stat.total += 1;
    if (s.status === EStoryStatus.Done) stat.completed += 1;
    byAssignee.set(s.assignee_id, stat);
  }

  return {
    cycle_id: cycle.id,
    counts,
    scope,
    completion_pct: scope > 0 ? Math.round((completed / scope) * 100) : 0,
    leading_by,
    burndown,
    assignees: [...byAssignee.values()],
  };
}
