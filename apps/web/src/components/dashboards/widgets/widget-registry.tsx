import type { ReactNode } from "react";
import {
  LeftToRightListBulletIcon,
  PieChartIcon,
  Analytics01Icon,
  Activity01Icon,
  Target01Icon,
  FlagIcon,
  UserGroupIcon,
  Rocket01Icon,
  ChartGanttIcon,
  ChartLineData01Icon,
  Calendar03Icon,
  Grid02Icon,
  UserCircleIcon,
  PlayIcon,
  EyeIcon,
  TagsIcon,
  TextIcon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { EDashboardWidgetType, type IDashboardWidget } from "@/types";

import { StoryListBody } from "./bodies/story-list-body";
import { StatusChartBody } from "./bodies/status-chart-body";
import { CounterBody } from "./bodies/counter-body";
import { ActivityBody } from "./bodies/activity-body";
import { KpiBody } from "./bodies/kpi-body";
import { StatusDonutBody } from "./bodies/status-donut-body";
import { PriorityBreakdownBody } from "./bodies/priority-breakdown-body";
import { TeamWorkloadBody } from "./bodies/team-workload-body";
import { SprintStatusBody } from "./bodies/sprint-status-body";
import { VelocityBody } from "./bodies/velocity-body";
import { DailyActivityBody } from "./bodies/daily-activity-body";
import { PlannedWorkloadBody } from "./bodies/planned-workload-body";
import { AssigneeActivityBody } from "./bodies/assignee-activity-body";
import { AssignedToMeBody, InProgressBody } from "./bodies/my-work-body";
import { WatchedBody } from "./bodies/watched-body";
import { LabelsBody } from "./bodies/labels-body";
import { IntroductionBody } from "./bodies/introduction-body";
import { RiskListBody } from "./bodies/risk-list-body";
import { ProjectHealthSummaryBody } from "./bodies/project-health-summary-body";

/** Context passed to a widget body so real widgets (GIN-48+) can fetch scoped data. */
export interface IWidgetRenderContext {
  workspaceSlug: string;
}

export interface IWidgetTypeMeta {
  type: EDashboardWidgetType;
  label: string;
  description: string;
  icon: IconSvgElement;
  /** Default grid footprint (12-col units) when added. */
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Widget body. GIN-47 ships a shared placeholder; GIN-48–51 replace per type. */
  render: (widget: IDashboardWidget, ctx: IWidgetRenderContext) => ReactNode;
}

export const WIDGET_TYPES: Record<EDashboardWidgetType, IWidgetTypeMeta> = {
  [EDashboardWidgetType.StoryList]: {
    type: EDashboardWidgetType.StoryList,
    label: "Work item list",
    description: "A filtered list of work items",
    icon: LeftToRightListBulletIcon,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 2 },
    render: (w, ctx) => (
      <StoryListBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.StatusChart]: {
    type: EDashboardWidgetType.StatusChart,
    label: "Status breakdown",
    description: "Work items by status",
    icon: PieChartIcon,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    render: (w, ctx) => (
      <StatusChartBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.Counter]: {
    type: EDashboardWidgetType.Counter,
    label: "Counter tile",
    description: "A single headline metric",
    icon: Analytics01Icon,
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    render: (w, ctx) => (
      <CounterBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.Activity]: {
    type: EDashboardWidgetType.Activity,
    label: "Activity feed",
    description: "Recent events across the workspace",
    icon: Activity01Icon,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    render: (_w, ctx) => <ActivityBody workspaceSlug={ctx.workspaceSlug} />,
  },
  // GIN-118 — overview components (real cross-project data).
  [EDashboardWidgetType.Kpi]: {
    type: EDashboardWidgetType.Kpi,
    label: "KPI tile",
    description: "A single headline stat with an icon",
    icon: Target01Icon,
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    render: (w, ctx) => <KpiBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />,
  },
  [EDashboardWidgetType.StatusDonut]: {
    type: EDashboardWidgetType.StatusDonut,
    label: "Status donut",
    description: "Work items by status, as a ring",
    icon: PieChartIcon,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    render: (w, ctx) => <StatusDonutBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />,
  },
  [EDashboardWidgetType.PriorityBreakdown]: {
    type: EDashboardWidgetType.PriorityBreakdown,
    label: "Priority breakdown",
    description: "Work items by priority, as meters",
    icon: FlagIcon,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    render: (w, ctx) => (
      <PriorityBreakdownBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.TeamWorkload]: {
    type: EDashboardWidgetType.TeamWorkload,
    label: "Team workload",
    description: "Open work per team member",
    icon: UserGroupIcon,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    render: (w, ctx) => <TeamWorkloadBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />,
  },
  [EDashboardWidgetType.SprintStatus]: {
    type: EDashboardWidgetType.SprintStatus,
    label: "Sprint status",
    description: "Active cycles and their progress",
    icon: Rocket01Icon,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    render: (_w, ctx) => <SprintStatusBody workspaceSlug={ctx.workspaceSlug} />,
  },
  [EDashboardWidgetType.Velocity]: {
    type: EDashboardWidgetType.Velocity,
    label: "Sprint velocity",
    description: "Committed vs completed per sprint",
    icon: ChartGanttIcon,
    defaultSize: { w: 5, h: 4 },
    minSize: { w: 3, h: 3 },
    render: (_w, ctx) => <VelocityBody workspaceSlug={ctx.workspaceSlug} />,
  },
  // GIN-160 — the date dimension.
  [EDashboardWidgetType.DailyActivity]: {
    type: EDashboardWidgetType.DailyActivity,
    label: "Daily activity",
    description: "Work items created, updated and completed, per period",
    icon: ChartLineData01Icon,
    defaultSize: { w: 8, h: 4 },
    minSize: { w: 4, h: 3 },
    render: (w, ctx) => (
      <DailyActivityBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.PlannedWorkload]: {
    type: EDashboardWidgetType.PlannedWorkload,
    label: "Planned workload",
    description: "Work starting, due and overdue, per period",
    icon: Calendar03Icon,
    defaultSize: { w: 8, h: 4 },
    minSize: { w: 4, h: 3 },
    render: (w, ctx) => (
      <PlannedWorkloadBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.AssigneeActivity]: {
    type: EDashboardWidgetType.AssigneeActivity,
    label: "Activity by person",
    description: "Each assignee's work, broken down by status",
    icon: Grid02Icon,
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 3 },
    render: (w, ctx) => (
      <AssigneeActivityBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  // Jira dashboard-gadget parity.
  [EDashboardWidgetType.AssignedToMe]: {
    type: EDashboardWidgetType.AssignedToMe,
    label: "Assigned to me",
    description: "Open work items assigned to you",
    icon: UserCircleIcon,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    render: (w, ctx) => (
      <AssignedToMeBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.InProgress]: {
    type: EDashboardWidgetType.InProgress,
    label: "My work in progress",
    description: "Your work items currently in progress",
    icon: PlayIcon,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    render: (w, ctx) => (
      <InProgressBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />
    ),
  },
  [EDashboardWidgetType.Watched]: {
    type: EDashboardWidgetType.Watched,
    label: "Watched work items",
    description: "Work items you're subscribed to",
    icon: EyeIcon,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    render: (w, ctx) => <WatchedBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />,
  },
  [EDashboardWidgetType.Labels]: {
    type: EDashboardWidgetType.Labels,
    label: "Labels",
    description: "Labels in use, with item counts",
    icon: TagsIcon,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    render: (w, ctx) => <LabelsBody workspaceSlug={ctx.workspaceSlug} settings={w.settings} />,
  },
  [EDashboardWidgetType.Introduction]: {
    type: EDashboardWidgetType.Introduction,
    label: "Introduction",
    description: "A static note for whoever reads this board",
    icon: TextIcon,
    defaultSize: { w: 4, h: 2 },
    minSize: { w: 2, h: 1 },
    render: (w) => <IntroductionBody settings={w.settings} />,
  },
  [EDashboardWidgetType.RiskList]: {
    type: EDashboardWidgetType.RiskList,
    label: "Risk list",
    description: "Open work items at delivery risk — overdue and high-priority",
    icon: Alert02Icon,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    render: (_w, ctx) => <RiskListBody workspaceSlug={ctx.workspaceSlug} />,
  },
  [EDashboardWidgetType.ProjectHealthSummary]: {
    type: EDashboardWidgetType.ProjectHealthSummary,
    label: "Project health",
    description: "Each project's forecast status — on track, at risk or off track",
    icon: Target01Icon,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    render: (_w, ctx) => <ProjectHealthSummaryBody workspaceSlug={ctx.workspaceSlug} />,
  },
};

export const WIDGET_TYPE_LIST: IWidgetTypeMeta[] = Object.values(WIDGET_TYPES);

/** Sections of the Add-widget picker, in display order (GIN-488). */
export const WIDGET_CATEGORIES = [
  "Work items",
  "Delivery & sprints",
  "Team",
  "Activity",
  "Personal",
  "Content",
] as const;

export type TWidgetCategory = (typeof WIDGET_CATEGORIES)[number];

/** Which section each widget lives in. Exhaustive by type, so a new widget can't
 *  ship without being placed in the catalogue. */
export const WIDGET_CATEGORY: Record<EDashboardWidgetType, TWidgetCategory> = {
  [EDashboardWidgetType.StoryList]: "Work items",
  [EDashboardWidgetType.StatusChart]: "Work items",
  [EDashboardWidgetType.StatusDonut]: "Work items",
  [EDashboardWidgetType.PriorityBreakdown]: "Work items",
  [EDashboardWidgetType.Labels]: "Work items",
  [EDashboardWidgetType.RiskList]: "Work items",
  [EDashboardWidgetType.Counter]: "Work items",
  [EDashboardWidgetType.Kpi]: "Work items",
  [EDashboardWidgetType.SprintStatus]: "Delivery & sprints",
  [EDashboardWidgetType.Velocity]: "Delivery & sprints",
  [EDashboardWidgetType.ProjectHealthSummary]: "Delivery & sprints",
  [EDashboardWidgetType.TeamWorkload]: "Team",
  [EDashboardWidgetType.AssigneeActivity]: "Team",
  [EDashboardWidgetType.Activity]: "Activity",
  [EDashboardWidgetType.DailyActivity]: "Activity",
  [EDashboardWidgetType.PlannedWorkload]: "Delivery & sprints",
  [EDashboardWidgetType.AssignedToMe]: "Personal",
  [EDashboardWidgetType.InProgress]: "Personal",
  [EDashboardWidgetType.Watched]: "Personal",
  [EDashboardWidgetType.Introduction]: "Content",
};

/** Max widgets per dashboard. Raised for GIN-118 overview boards (KPI row +
 * several charts easily exceed the original 12). */
export const MAX_WIDGETS = 20;

/**
 * Widgets an anonymous visitor may see on a publicly shared dashboard (GIN-489).
 *
 * Excluded: anything scoped to the viewer (assigned to me, my work in progress,
 * watched), anything that names individuals (team workload, activity by person),
 * and anything printing raw work-item text (work item list, risk list, the
 * activity feed). Project health stays private for now — it exposes per-project
 * forecast internals.
 *
 * The server enforces this same list (`features/dashboards/public_widgets.py`);
 * this copy only drives the pre-publish warning. Keep the two in step.
 */
export const PUBLIC_ELIGIBLE_WIDGET_TYPES: ReadonlySet<EDashboardWidgetType> = new Set([
  EDashboardWidgetType.StatusChart,
  EDashboardWidgetType.StatusDonut,
  EDashboardWidgetType.PriorityBreakdown,
  EDashboardWidgetType.Counter,
  EDashboardWidgetType.Kpi,
  EDashboardWidgetType.Labels,
  EDashboardWidgetType.DailyActivity,
  EDashboardWidgetType.PlannedWorkload,
  EDashboardWidgetType.SprintStatus,
  EDashboardWidgetType.Velocity,
  EDashboardWidgetType.Introduction,
]);

/** Widget labels on this board that a public visitor would NOT see, in board
 *  order and de-duplicated — the owner sees these before publishing. */
export function blockedPublicWidgetLabels(widgets: IDashboardWidget[]): string[] {
  const labels = new Set<string>();
  for (const widget of widgets) {
    if (PUBLIC_ELIGIBLE_WIDGET_TYPES.has(widget.type)) continue;
    labels.add(WIDGET_TYPES[widget.type]?.label ?? widget.type);
  }
  return [...labels];
}
