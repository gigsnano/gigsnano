import type { ID, ISODateString } from "@/types/common";

/** Display config for a dashboard (Jira-style column layout). Grid detail lands in GIN-47. */
export interface IDashboardLayout {
  columns: number;
}

/** Widget kinds. Bodies are implemented per-type in GIN-48–51; the grid framework
 * (GIN-47) renders them from a registry so new types drop in without touching the grid. */
export enum EDashboardWidgetType {
  StoryList = "story_list",
  StatusChart = "status_chart",
  Counter = "counter",
  Activity = "activity",
  // GIN-118 — richer, cross-project components for manager/owner overview boards.
  Kpi = "kpi",
  StatusDonut = "status_donut",
  PriorityBreakdown = "priority_breakdown",
  TeamWorkload = "team_workload",
  SprintStatus = "sprint_status",
  Velocity = "velocity",
  // GIN-160 — the date dimension: what happened per day, and who holds what.
  DailyActivity = "daily_activity",
  PlannedWorkload = "planned_workload",
  AssigneeActivity = "assignee_activity",
  // Jira dashboard-gadget parity.
  AssignedToMe = "assigned_to_me",
  InProgress = "in_progress",
  Watched = "watched",
  Labels = "labels",
  Introduction = "introduction",
  // GIN-89 — shared insight widget (persona 360 + any board).
  RiskList = "risk_list",
  // GIN-341 — condensed per-project forecast/health roll-up (Manager 360).
  ProjectHealthSummary = "project_health_summary",
}

/** Headline metric a KPI tile shows (GIN-118). Sourced from workspace analytics +
 * the dashboard metrics endpoint — every value is real, none fabricated. */
export enum EKpiMetric {
  OpenItems = "open_items",
  InProgress = "in_progress",
  InReview = "in_review",
  Completed = "completed",
  ActiveProjects = "active_projects",
  TotalProjects = "total_projects",
  ActiveCycles = "active_cycles",
  Members = "members",
}

/** Field a list/chart widget groups its rows by (GIN-52). */
export enum EWidgetGroupBy {
  None = "none",
  Status = "status",
  Priority = "priority",
  Project = "project",
  Assignee = "assignee",
}

/**
 * Per-widget filter + grouping config (GIN-52). Absent/empty fields mean "all".
 * Persisted inside the widget so it restores on load. `EStoryStatus`/`EStoryPriority`
 * are referenced structurally to avoid a types import cycle.
 */
export interface IWidgetSettings {
  project_id?: string;
  assignee_id?: string;
  priority?: string;
  status?: string;
  group_by?: EWidgetGroupBy;
  /** KPI tile only (GIN-118) — which headline metric to display. */
  metric?: EKpiMetric;
  /**
   * Date window (GIN-160). `date_range` is the preset the UI shows; `date_from`/
   * `date_to` (YYYY-MM-DD) are only set when it's `Custom`. Storing the preset
   * rather than resolved dates keeps a saved "last 7 days" widget meaning the
   * last 7 days tomorrow, instead of freezing the week it was created.
   */
  date_range?: EWidgetDateRange;
  date_from?: string;
  date_to?: string;
  /** Introduction widget only — the body text it renders. */
  text?: string;
}

/** Date window presets for a widget (GIN-160). */
export enum EWidgetDateRange {
  All = "all",
  Last7 = "7d",
  Last30 = "30d",
  Last90 = "90d",
  Custom = "custom",
}

/**
 * A widget placed on a dashboard. `x/y/w/h` are react-grid-layout cells on the
 * 12-column grid. `settings` holds per-widget config (filters/grouping) whose
 * shape each widget type owns (GIN-52 formalizes it).
 */
export interface IDashboardWidget {
  id: string;
  type: EDashboardWidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: IWidgetSettings;
}

/**
 * Dashboard-wide filter: narrows every widget on the board. Persisted in
 * `config` beside the widgets. Empty `project_ids` = all projects; a date window
 * uses the same preset-or-custom shape as a widget's, and when set it replaces
 * each widget's own window.
 */
export interface IDashboardFilters {
  project_ids?: string[];
  date_range?: EWidgetDateRange;
  date_from?: string;
  date_to?: string;
}

export interface IDashboardConfig {
  widgets: IDashboardWidget[];
  filters?: IDashboardFilters;
}

/** Who can open a dashboard (GIN-489). Always `Private` until explicitly published. */
export enum EDashboardVisibility {
  Private = "private",
  /** Every member of the workspace can open it, signed in. No link. */
  Shared = "shared",
  /** Anyone holding the token link, signed in or not. */
  Public = "public",
}

export interface IDashboard {
  id: ID;
  workspace_slug: string;
  owner_id: ID;
  name: string;
  description: string;
  is_favorite: boolean;
  layout: IDashboardLayout;
  config: IDashboardConfig;
  visibility: EDashboardVisibility;
  /** The share credential, returned only to the owner. `null` while private. */
  public_token: string | null;
  published_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface IShareDashboardPayload {
  visibility: EDashboardVisibility;
}

/** A widget as an anonymous visitor receives it — no project/assignee filters:
 *  those stay server-side and are applied when the widget fetches its data. */
export interface IPublicDashboardWidget {
  id: string;
  type: EDashboardWidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings: IWidgetSettings;
}

/** A published dashboard for the public page. Carries no workspace, owner,
 *  project or user identifiers. */
export interface IPublicDashboard {
  name: string;
  description: string;
  widgets: IPublicDashboardWidget[];
  updated_at: ISODateString;
  /** The board's date window. Its project filter is applied server-side. */
  filters?: Omit<IDashboardFilters, "project_ids">;
}

export interface ICreateDashboardPayload {
  name: string;
  description?: string;
  layout?: IDashboardLayout;
  config?: IDashboardConfig;
}

export interface IUpdateDashboardPayload {
  name?: string;
  description?: string;
  is_favorite?: boolean;
  layout?: IDashboardLayout;
  config?: IDashboardConfig;
}

/** Server-side aggregated work-item metrics for widgets (GIN-54). */
export interface IDashboardMetrics {
  total: number;
  open: number;
  status_counts: Record<string, number>;
  priority_counts: Record<string, number>;
  assignee_counts: Record<string, number>;
  /** assignee_id (or "unassigned") -> status -> count (GIN-164). */
  assignee_status_counts: Record<string, Record<string, number>>;
  /** Labels in use, commonest first; name/colour denormalized. Unlabelled items
   * are absent rather than bucketed. */
  label_counts: ILabelCount[];
}

export interface ILabelCount {
  id: string;
  name: string;
  color: string;
  count: number;
}

/** Query filters for the metrics endpoint (mirror IWidgetSettings, minus group_by). */
export interface IDashboardMetricsParams {
  project_id?: string;
  /** Comma list — the dashboard-wide project filter. */
  project_ids?: string;
  assignee_id?: string;
  priority?: string;
  status?: string;
  /** YYYY-MM-DD; bounds `created_at`. Absent = all time (GIN-160). */
  date_from?: string;
  date_to?: string;
}

/** How a window is grouped (GIN-527). Wide windows read better by week. */
export enum EChartBucket {
  Day = "day",
  Week = "week",
}

/**
 * One period of work-item *activity* — things that happened (GIN-163, GIN-527).
 * `completed` is a subset of `updated`: closing an item is also a change to it.
 */
export interface IDailyActivityPoint {
  /** YYYY-MM-DD, the period's first day. Named `date` to match `xDataKey`. */
  date: string;
  created: number;
  updated: number;
  completed: number;
}

/** Activity over a window — one point per period, zero-filled (GIN-161). */
export interface IDashboardActivity {
  period_from: string;
  period_to: string;
  bucket: EChartBucket;
  daily: IDailyActivityPoint[];
}

/**
 * One period of *scheduled* work — things meant to happen (GIN-527). Kept apart
 * from activity so newly-filed work can't be read as delivered work.
 */
export interface IPlannedWorkloadPoint {
  date: string;
  starting: number;
  due: number;
  /** Past-due and still open; settled work drops out. */
  overdue: number;
}

export interface IPlannedWorkload {
  period_from: string;
  period_to: string;
  bucket: EChartBucket;
  daily: IPlannedWorkloadPoint[];
}

export interface IDashboardActivityParams {
  project_id?: string;
  project_ids?: string;
  date_from?: string;
  date_to?: string;
  bucket?: EChartBucket;
}
