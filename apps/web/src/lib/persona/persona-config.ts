import {
  SourceCodeSquareIcon,
  Building06Icon,
  TestTube01Icon,
  ChartIncreaseIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { EDashboardWidgetType, EKpiMetric, EWorkspaceRole } from "@/types";
import type { IWidgetSettings } from "@/types";

/** The four role-scoped lenses over the shared Context Engine (GIN-87). */
export enum EPersonaRole {
  Manager = "manager",
  Developer = "developer",
  Architect = "architect",
  Qa = "qa",
}

export interface IPersonaWidget {
  type: EDashboardWidgetType;
  title: string;
  settings?: IWidgetSettings;
  /** Columns spanned in the 3-col persona grid. */
  colSpan?: 1 | 2 | 3;
  /** Card content height in px. */
  minH?: number;
}

export interface IPersonaDef {
  role: EPersonaRole;
  label: string;
  tagline: string;
  icon: IconSvgElement;
  /** When set, only members at/above this workspace role see the lens. */
  minRole?: EWorkspaceRole;
  /** Curated composition of shared widgets; null = not built yet (P1–P3). */
  widgets: IPersonaWidget[] | null;
  /** Feature that builds this persona's board (shown in the placeholder). */
  pendingTicket?: string;
}

const kpi = (metric: EKpiMetric, title: string): IPersonaWidget => ({
  type: EDashboardWidgetType.Kpi,
  title,
  colSpan: 1,
  minH: 116,
  settings: { metric },
});

export const PERSONA_CONFIG: Record<EPersonaRole, IPersonaDef> = {
  [EPersonaRole.Manager]: {
    role: EPersonaRole.Manager,
    label: "Manager",
    tagline: "Delivery health across every project.",
    icon: ChartIncreaseIcon,
    minRole: EWorkspaceRole.Admin,
    widgets: [
      kpi(EKpiMetric.ActiveProjects, "Active projects"),
      kpi(EKpiMetric.OpenItems, "Open items"),
      kpi(EKpiMetric.InProgress, "In progress"),
      kpi(EKpiMetric.Completed, "Completed"),
      { type: EDashboardWidgetType.ProjectHealthSummary, title: "Project health", colSpan: 1, minH: 320 },
      { type: EDashboardWidgetType.RiskList, title: "Risks & attention", colSpan: 1, minH: 320 },
      { type: EDashboardWidgetType.SprintStatus, title: "Sprint status", colSpan: 1, minH: 320 },
      { type: EDashboardWidgetType.TeamWorkload, title: "Team workload", colSpan: 1, minH: 320 },
      { type: EDashboardWidgetType.StatusDonut, title: "Status breakdown", colSpan: 1, minH: 320 },
      { type: EDashboardWidgetType.Velocity, title: "Velocity", colSpan: 2, minH: 280 },
      { type: EDashboardWidgetType.Activity, title: "Recent activity", colSpan: 1, minH: 280 },
      { type: EDashboardWidgetType.DailyActivity, title: "Daily activity", colSpan: 3, minH: 260 },
    ],
  },
  [EPersonaRole.Developer]: {
    role: EPersonaRole.Developer,
    label: "Developer",
    tagline: "Your work, your focus, your risks.",
    icon: SourceCodeSquareIcon,
    widgets: [
      { type: EDashboardWidgetType.AssignedToMe, title: "Assigned to me", colSpan: 1, minH: 300 },
      { type: EDashboardWidgetType.InProgress, title: "In progress", colSpan: 1, minH: 300 },
      { type: EDashboardWidgetType.Watched, title: "Watching", colSpan: 1, minH: 300 },
      { type: EDashboardWidgetType.RiskList, title: "At risk", colSpan: 1, minH: 300 },
      { type: EDashboardWidgetType.Activity, title: "Recent activity", colSpan: 1, minH: 300 },
      { type: EDashboardWidgetType.DailyActivity, title: "Activity over time", colSpan: 3, minH: 260 },
    ],
  },
  [EPersonaRole.Architect]: {
    role: EPersonaRole.Architect,
    label: "Architect",
    tagline: "Dependency graph, schema, hotspots.",
    icon: Building06Icon,
    widgets: null,
    pendingTicket: "GIN-95",
  },
  [EPersonaRole.Qa]: {
    role: EPersonaRole.Qa,
    label: "QA",
    tagline: "Quality signals, coverage, risk.",
    icon: TestTube01Icon,
    widgets: null,
    pendingTicket: "GIN-94",
  },
};

/** Display order of the persona switcher. */
export const PERSONA_ORDER: EPersonaRole[] = [
  EPersonaRole.Manager,
  EPersonaRole.Developer,
  EPersonaRole.Architect,
  EPersonaRole.Qa,
];

export function isPersonaRole(value: string): value is EPersonaRole {
  return PERSONA_ORDER.includes(value as EPersonaRole);
}

const ROLE_RANK: Record<EWorkspaceRole, number> = {
  [EWorkspaceRole.Guest]: 0,
  [EWorkspaceRole.Member]: 1,
  [EWorkspaceRole.Admin]: 2,
  [EWorkspaceRole.Owner]: 3,
};

/** Whether a workspace role satisfies a persona's `minRole` gate. */
export function personaAllowed(def: IPersonaDef, workspaceRole: EWorkspaceRole | null): boolean {
  if (!def.minRole) return true;
  if (!workspaceRole) return false;
  return ROLE_RANK[workspaceRole] >= ROLE_RANK[def.minRole];
}
