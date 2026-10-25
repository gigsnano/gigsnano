import type { IDashboard, IDashboardWidget } from "@/types";
import { EDashboardVisibility, EDashboardWidgetType, EKpiMetric } from "@/types";

const TS = "2026-06-25T09:00:00Z";

// GIN-118 — the seeded default "Overview" board (manager/owner view). A KPI row
// over a status donut, priority breakdown, sprint status, team workload, velocity,
// and activity — all backed by real workspace data.
const OVERVIEW_WIDGETS: IDashboardWidget[] = [
  { id: "ov_kpi_projects", type: EDashboardWidgetType.Kpi, title: "Active projects", x: 0, y: 0, w: 3, h: 2, settings: { metric: EKpiMetric.ActiveProjects } },
  { id: "ov_kpi_progress", type: EDashboardWidgetType.Kpi, title: "In progress", x: 3, y: 0, w: 3, h: 2, settings: { metric: EKpiMetric.InProgress } },
  { id: "ov_kpi_open", type: EDashboardWidgetType.Kpi, title: "Open work items", x: 6, y: 0, w: 3, h: 2, settings: { metric: EKpiMetric.OpenItems } },
  { id: "ov_kpi_members", type: EDashboardWidgetType.Kpi, title: "Team members", x: 9, y: 0, w: 3, h: 2, settings: { metric: EKpiMetric.Members } },
  { id: "ov_donut", type: EDashboardWidgetType.StatusDonut, title: "Status breakdown", x: 0, y: 2, w: 4, h: 4 },
  { id: "ov_priority", type: EDashboardWidgetType.PriorityBreakdown, title: "Priority breakdown", x: 4, y: 2, w: 4, h: 4 },
  { id: "ov_sprints", type: EDashboardWidgetType.SprintStatus, title: "Sprint status", x: 8, y: 2, w: 4, h: 5 },
  { id: "ov_workload", type: EDashboardWidgetType.TeamWorkload, title: "Team workload", x: 0, y: 6, w: 4, h: 5 },
  { id: "ov_velocity", type: EDashboardWidgetType.Velocity, title: "Sprint velocity", x: 4, y: 6, w: 4, h: 4 },
  { id: "ov_activity", type: EDashboardWidgetType.Activity, title: "Recent activity", x: 8, y: 7, w: 4, h: 5 },
];

// Owned by the mock signed-in user (u_1 / Ada) in the `acme` workspace.
export const dashboards: IDashboard[] = [
  {
    id: "dsh_overview",
    workspace_slug: "acme",
    owner_id: "u_1",
    name: "Overview",
    description: "Cross-project health for managers and owners.",
    is_favorite: true,
    layout: { columns: 3 },
    config: { widgets: OVERVIEW_WIDGETS },
    visibility: EDashboardVisibility.Private,
    public_token: null,
    published_at: null,
    created_at: TS,
    updated_at: TS,
  },
  {
    id: "dsh_1",
    workspace_slug: "acme",
    owner_id: "u_1",
    name: "My work",
    description: "Everything assigned to me across projects.",
    is_favorite: true,
    layout: { columns: 2 },
    config: { widgets: [] },
    visibility: EDashboardVisibility.Private,
    public_token: null,
    published_at: null,
    created_at: TS,
    updated_at: TS,
  },
  {
    id: "dsh_2",
    workspace_slug: "acme",
    owner_id: "u_1",
    name: "Sprint health",
    description: "Status breakdown and velocity at a glance.",
    is_favorite: false,
    layout: { columns: 3 },
    config: { widgets: [] },
    visibility: EDashboardVisibility.Private,
    public_token: null,
    published_at: null,
    created_at: TS,
    updated_at: TS,
  },
];
