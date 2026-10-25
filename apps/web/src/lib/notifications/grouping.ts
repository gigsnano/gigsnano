import type { INotification } from "@/types";

export type NotificationGroupKey = "today" | "yesterday" | "earlier";

export interface INotificationGroup {
  key: NotificationGroupKey;
  label: string;
  items: INotification[];
}

const GROUP_LABEL: Record<NotificationGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Bucket already-sorted (newest-first) notifications into Today / Yesterday /
 * Earlier relative to `now`. Pure + `now`-injected so tests don't depend on the
 * wall clock. Empty groups are dropped so the UI never renders a bare heading.
 */
export function groupByDate(
  items: INotification[],
  now: Date = new Date(),
): INotificationGroup[] {
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;

  const buckets: Record<NotificationGroupKey, INotification[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };

  for (const item of items) {
    const t = new Date(item.created_at).getTime();
    if (t >= todayStart) buckets.today.push(item);
    else if (t >= yesterdayStart) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }

  return (["today", "yesterday", "earlier"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: GROUP_LABEL[key], items: buckets[key] }));
}
