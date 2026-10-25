import { EChartBucket, EStoryStatus, EWidgetDateRange } from "@/types";
import { STORY_STATUS_STROKE } from "@/constants/story-meta";

/**
 * Shared metric definitions for the dashboard charts (GIN-527).
 *
 * Label, colour and drill-down query live together so the grouped-column and
 * trend-line renderings of the same metric can never disagree, and so the list
 * a point opens is filtered the same way the point was counted.
 */
export interface IChartSeries {
  key: string;
  label: string;
  color: string;
  /**
   * GigsQL selecting the work items behind one point, or null when the field
   * isn't in the filter vocabulary and any query would be a lie. `null` series
   * render normally but aren't clickable.
   */
  drill: ((from: string, to: string) => string) | null;
}

const NEUTRAL = "var(--color-muted-foreground)";
const OPEN_STATUSES = [
  EStoryStatus.Todo,
  EStoryStatus.InProgress,
  EStoryStatus.InReview,
].join(", ");

/** What happened: events, each on the day it occurred. */
export const ACTIVITY_SERIES: readonly IChartSeries[] = [
  {
    key: "created",
    label: "Created",
    color: NEUTRAL,
    drill: (from, to) => `created:${from}..${to}`,
  },
  {
    key: "updated",
    label: "Updated",
    color: STORY_STATUS_STROKE[EStoryStatus.InProgress],
    // No `updated:` field in GigsQL — a date-less query would open the wrong
    // list, so this point opens nothing until the vocabulary gains one.
    drill: null,
  },
  {
    key: "completed",
    label: "Completed",
    color: STORY_STATUS_STROKE[EStoryStatus.Done],
    // Closed *on* a given day isn't filterable (the transition date lives in
    // story_activities), so this narrows to closed work rather than lying about
    // the window.
    drill: () => `status:${EStoryStatus.Done}`,
  },
];

/** What is scheduled: dates the item carries, not things that happened. */
export const PLANNED_SERIES: readonly IChartSeries[] = [
  {
    key: "starting",
    label: "Starting",
    color: NEUTRAL,
    // `start_date` isn't in the GigsQL vocabulary yet.
    drill: null,
  },
  {
    key: "due",
    label: "Due",
    color: STORY_STATUS_STROKE[EStoryStatus.InReview],
    drill: (from, to) => `due:${from}..${to}`,
  },
  {
    key: "overdue",
    label: "Overdue",
    color: "var(--color-destructive)",
    drill: (from, to) => `due:${from}..${to} status in (${OPEN_STATUSES})`,
  },
];

/**
 * The period choices and how each one buckets.
 *
 * Every period draws as grouped columns. These are counts of discrete events,
 * and a line between two days implies values in between that never existed —
 * columns say "this many, that day" without inventing anything. Dropping
 * weekends made this practical at 30 days too: that period is ~22 bars, not 30.
 * 90 days still buckets weekly, because 90 daily bars would be unreadable
 * however they are drawn.
 */
export interface IChartPeriod {
  range: EWidgetDateRange;
  label: string;
  bucket: EChartBucket;
}

export const CHART_PERIODS: readonly IChartPeriod[] = [
  { range: EWidgetDateRange.Last7, label: "7d", bucket: EChartBucket.Day },
  { range: EWidgetDateRange.Last30, label: "30d", bucket: EChartBucket.Day },
  { range: EWidgetDateRange.Last90, label: "90d", bucket: EChartBucket.Week },
];

export const DEFAULT_PERIOD = CHART_PERIODS[1];

/** The period a widget's stored `date_range` selects, or the 30-day default. */
export function periodFor(range?: EWidgetDateRange): IChartPeriod {
  return CHART_PERIODS.find((p) => p.range === range) ?? DEFAULT_PERIOD;
}

/**
 * The last day a period covers, given its first day. A weekly bucket owns the
 * six days after its start; a daily one owns only itself. Used to build the
 * drill-down window and the tooltip's period label.
 */
export function periodEnd(start: string, bucket: EChartBucket): string {
  if (bucket === EChartBucket.Day) return start;
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

/**
 * Saturday and Sunday, as `Date#getUTCDay` numbers them.
 *
 * Hardcoded because nothing in the product knows otherwise yet — configurable
 * weekend days are an explicitly deferred setting (see `lib/nav/command-actions`).
 * Named rather than inlined so the day that setting lands, this is the one place
 * that changes.
 */
const WEEKEND_DAYS = new Set([0, 6]);

/**
 * Drop the days nobody was working from a daily chart.
 *
 * A flat Saturday and Sunday in every week is noise: it says nothing about
 * delivery, and on a 30-day line it drags the shape down twice a week so the
 * working-week trend is harder to read. Weekly buckets are returned untouched —
 * a week contains its own weekend, and dropping the bucket would drop the
 * weekdays with it.
 *
 * `holidays` is accepted but has no source yet; pass a set of `YYYY-MM-DD`
 * strings once a workspace holiday calendar exists.
 */
export function excludeNonWorkingDays<T extends { date: string }>(
  points: readonly T[],
  bucket: EChartBucket,
  holidays: ReadonlySet<string> = new Set(),
): T[] {
  if (bucket !== EChartBucket.Day) return [...points];
  return points.filter((p) => {
    if (holidays.has(p.date)) return false;
    // Parsed as UTC on purpose: a local-time parse shifts the date behind UTC
    // and would classify the wrong day as the weekend for half the world.
    return !WEEKEND_DAYS.has(new Date(`${p.date}T00:00:00Z`).getUTCDay());
  });
}

/**
 * A tick count that lands on whole numbers.
 *
 * d3 picks "nice" steps for the count it's given, so asking for 5 ticks over a
 * domain of 0–3 yields halves. Counts are discrete, so cap the request at the
 * largest value present.
 */
export function integerTickCount(max: number, wanted = 5): number {
  return Math.max(2, Math.min(wanted, Math.ceil(max) || 2));
}
