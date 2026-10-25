import { EChartBucket, EWidgetDateRange, EWidgetGroupBy, type IWidgetSettings } from "@/types";
import type { IDashboardFilters, IDashboardMetricsParams, IStory } from "@/types";

/** Local YYYY-MM-DD. `toISOString()` would shift the day for anyone behind UTC. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const PRESET_DAYS: Partial<Record<EWidgetDateRange, number>> = {
  [EWidgetDateRange.Last7]: 7,
  [EWidgetDateRange.Last30]: 30,
  [EWidgetDateRange.Last90]: 90,
};

/**
 * Resolve a widget's date settings to concrete `date_from`/`date_to` (GIN-160).
 *
 * Presets are resolved against `today` on every call rather than stored, so a
 * saved "last 7 days" widget still means the last 7 days next month. `All`
 * returns an empty window — absent params mean all-time server-side.
 * A `Custom` range missing either end is treated as unbounded on that end.
 */
export function resolveDateRange(
  settings?: IWidgetSettings,
  today: Date = new Date(),
): { date_from?: string; date_to?: string } {
  const range = settings?.date_range ?? EWidgetDateRange.All;

  if (range === EWidgetDateRange.Custom) {
    return { date_from: settings?.date_from, date_to: settings?.date_to };
  }

  const days = PRESET_DAYS[range];
  if (!days) return {};

  const from = new Date(today);
  // Inclusive of today, so "last 7 days" spans today and the 6 before it.
  from.setDate(from.getDate() - (days - 1));
  return { date_from: isoDay(from), date_to: isoDay(today) };
}

/** Map a widget's settings to the metrics endpoint's query params (drops group_by). */
export function toMetricsParams(settings?: IWidgetSettings): IDashboardMetricsParams {
  return {
    project_id: settings?.project_id,
    assignee_id: settings?.assignee_id,
    priority: settings?.priority,
    status: settings?.status,
    ...resolveDateRange(settings),
  };
}

/**
 * The dashboard-wide date window, or `null` when the filter leaves each widget's
 * own window alone ("All time" or unset).
 */
export function dashboardWindow(
  filters?: IDashboardFilters | null,
  today: Date = new Date(),
): { date_from?: string; date_to?: string } | null {
  const range = filters?.date_range;
  if (!range || range === EWidgetDateRange.All) return null;
  return resolveDateRange(filters, today);
}

/**
 * A widget's settings with the dashboard's window swapped in, for the widgets
 * that filter client-side (`filterStories`). Unchanged when there's no window.
 */
export function withDashboardWindow(
  settings: IWidgetSettings | undefined,
  filters?: IDashboardFilters | null,
  today: Date = new Date(),
): IWidgetSettings | undefined {
  const window = dashboardWindow(filters, today);
  return window ? { ...settings, date_range: EWidgetDateRange.Custom, ...window } : settings;
}

/**
 * Layer the dashboard-wide filter over a widget's query params.
 *
 * Projects narrow alongside the widget's own `project_id` (the server ANDs
 * them, so a widget pinned outside the selection shows nothing — that's the
 * honest answer). A set date window replaces the widget's own.
 */
export function applyDashboardFilters<
  T extends { project_ids?: string; date_from?: string; date_to?: string },
>(params: T, filters?: IDashboardFilters | null, today: Date = new Date()): T {
  if (!filters) return params;
  const ids = filters.project_ids?.length ? filters.project_ids.join(",") : undefined;
  return { ...params, ...(ids ? { project_ids: ids } : {}), ...dashboardWindow(filters, today) };
}

const CHART_MAX_DAYS = 366; // the chart endpoints' cap (`_ACTIVITY_MAX_DAYS`)
const CHART_DEFAULT_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * A dashboard window fitted to the chart endpoints: both ends filled the way the
 * server would fill them, clamped to its one-year cap (a 400 otherwise), and
 * bucketed weekly past a month — the same point the 90d period switches.
 */
export function chartWindow(
  window: { date_from?: string; date_to?: string },
  today: Date = new Date(),
): { date_from: string; date_to: string; bucket: EChartBucket } {
  const to = window.date_to ?? isoDay(today);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const floor = toMs - (CHART_MAX_DAYS - 1) * DAY_MS;
  const fromMs = window.date_from
    ? Math.max(Date.parse(`${window.date_from}T00:00:00Z`), floor)
    : toMs - (CHART_DEFAULT_DAYS - 1) * DAY_MS;
  const days = Math.round((toMs - fromMs) / DAY_MS) + 1;
  return {
    date_from: new Date(fromMs).toISOString().slice(0, 10),
    date_to: to,
    bucket: days > 31 ? EChartBucket.Week : EChartBucket.Day,
  };
}

/**
 * Pure filter + grouping for dashboard widgets (GIN-52). Kept framework-free and
 * unit-tested so widget bodies just render the result.
 */

/**
 * Keep only stories matching the widget's set filters (unset field = "all").
 *
 * The date window is applied here too, against `created_at`, so it means the same
 * thing on client-filtered list widgets as it does on the server-aggregated ones
 * (GIN-160). `date_to` is inclusive of its whole day.
 */
export function filterStories(
  items: IStory[],
  settings?: IWidgetSettings,
  today: Date = new Date(),
): IStory[] {
  if (!settings) return items;
  const { date_from: from, date_to: to } = resolveDateRange(settings, today);
  return items.filter(
    (s) =>
      (!settings.project_id || s.project_id === settings.project_id) &&
      (!settings.assignee_id || s.assignee_id === settings.assignee_id) &&
      (!settings.priority || s.priority === settings.priority) &&
      (!settings.status || s.status === settings.status) &&
      (!from || isoDay(new Date(s.created_at)) >= from) &&
      (!to || isoDay(new Date(s.created_at)) <= to),
  );
}

export interface IStoryGroup {
  /** Raw group value (status/priority enum, project id, assignee id, or "none"). */
  key: string;
  items: IStory[];
}

/**
 * Group stories by a field. Returns a stable-ordered array of groups; the caller
 * resolves display labels (status/priority meta, project/user names). `None`
 * returns a single group so list rendering can stay uniform.
 */
export function groupStories(items: IStory[], groupBy?: EWidgetGroupBy): IStoryGroup[] {
  if (!groupBy || groupBy === EWidgetGroupBy.None) {
    return [{ key: "none", items }];
  }
  const pick = (s: IStory): string => {
    switch (groupBy) {
      case EWidgetGroupBy.Status:
        return s.status;
      case EWidgetGroupBy.Priority:
        return s.priority;
      case EWidgetGroupBy.Project:
        return s.project_id;
      case EWidgetGroupBy.Assignee:
        return s.assignee_id ?? "unassigned";
      default:
        return "none";
    }
  };
  const groups = new Map<string, IStory[]>();
  for (const s of items) {
    const key = pick(s);
    const bucket = groups.get(key);
    if (bucket) bucket.push(s);
    else groups.set(key, [s]);
  }
  return Array.from(groups, ([key, groupItems]) => ({ key, items: groupItems }));
}
