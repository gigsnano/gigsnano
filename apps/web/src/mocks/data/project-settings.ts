import type {
  ICustomFieldDefinition,
  IProjectFeature,
  IProjectLabel,
  IProjectState,
  IProjectEstimate,
  IProjectAutomation,
} from "@/types";
import { ECustomFieldType, EStateGroup } from "@/types";

const TS = "2026-05-04T10:00:00Z";

export const projectLabels: IProjectLabel[] = [
  { id: "lbl_mba_1", project_id: "prj_mba", name: "Bug", color: "#ef4444", created_at: TS },
  { id: "lbl_mba_2", project_id: "prj_mba", name: "Feature", color: "#3b82f6", created_at: TS },
  { id: "lbl_mba_3", project_id: "prj_mba", name: "Tech debt", color: "#a855f7", created_at: TS },
  { id: "lbl_ad_1", project_id: "prj_ad", name: "Analytics", color: "#06b6d4", created_at: TS },
  { id: "lbl_ad_2", project_id: "prj_ad", name: "Infra", color: "#64748b", created_at: TS },
  { id: "lbl_ds_1", project_id: "prj_ds", name: "Component", color: "#f59e0b", created_at: TS },
];

export const projectStates: IProjectState[] = [
  { id: "pst_mba_1", project_id: "prj_mba", name: "Backlog", color: "#94a3b8", group: EStateGroup.Backlog, order: 0 },
  { id: "pst_mba_2", project_id: "prj_mba", name: "Todo", color: "#64748b", group: EStateGroup.Unstarted, order: 1 },
  { id: "pst_mba_3", project_id: "prj_mba", name: "In progress", color: "#3b82f6", group: EStateGroup.Started, order: 2 },
  { id: "pst_mba_4", project_id: "prj_mba", name: "In review", color: "#8b5cf6", group: EStateGroup.Started, order: 3 },
  { id: "pst_mba_5", project_id: "prj_mba", name: "Done", color: "#22c55e", group: EStateGroup.Completed, order: 4 },
  { id: "pst_ad_1", project_id: "prj_ad", name: "Backlog", color: "#94a3b8", group: EStateGroup.Backlog, order: 0 },
  { id: "pst_ad_2", project_id: "prj_ad", name: "Todo", color: "#64748b", group: EStateGroup.Unstarted, order: 1 },
  { id: "pst_ad_3", project_id: "prj_ad", name: "In progress", color: "#3b82f6", group: EStateGroup.Started, order: 2 },
  { id: "pst_ad_4", project_id: "prj_ad", name: "Done", color: "#22c55e", group: EStateGroup.Completed, order: 3 },
];

export const projectFeatures: IProjectFeature[] = [
  {
    id: "feat_mba_cycles",
    project_id: "prj_mba",
    key: "cycles",
    name: "Cycles",
    description: "Time-boxed sprints for delivery after Sprint-0.",
    enabled: true,
  },
  {
    id: "feat_mba_modules",
    project_id: "prj_mba",
    key: "modules",
    name: "Modules",
    description: "Group stories into feature areas across sprints.",
    enabled: true,
  },
  {
    id: "feat_mba_views",
    project_id: "prj_mba",
    key: "views",
    name: "Views",
    description: "Saved board, list, and table filters.",
    enabled: true,
  },
  {
    id: "feat_mba_pages",
    project_id: "prj_mba",
    key: "pages",
    name: "Pages",
    description: "Wiki-style project documentation (coming soon).",
    enabled: false,
  },
  {
    id: "feat_ad_cycles",
    project_id: "prj_ad",
    key: "cycles",
    name: "Cycles",
    description: "Time-boxed sprints for delivery after Sprint-0.",
    enabled: true,
  },
  {
    id: "feat_ad_modules",
    project_id: "prj_ad",
    key: "modules",
    name: "Modules",
    description: "Group stories into feature areas across sprints.",
    enabled: false,
  },
  {
    id: "feat_ds_cycles",
    project_id: "prj_ds",
    key: "cycles",
    name: "Cycles",
    description: "Time-boxed sprints for delivery after Sprint-0.",
    enabled: true,
  },
  {
    id: "feat_ds_modules",
    project_id: "prj_ds",
    key: "modules",
    name: "Modules",
    description: "Group stories into feature areas across sprints.",
    enabled: true,
  },
];

export const projectEstimates: IProjectEstimate[] = [
  {
    id: "est_mba_1",
    project_id: "prj_mba",
    name: "Story points",
    type: "points",
    description: "Fibonacci scale for sprint planning.",
    created_at: TS,
  },
  {
    id: "est_mba_2",
    project_id: "prj_mba",
    name: "Engineering hours",
    type: "hours",
    description: "Rough hour estimates for capacity planning.",
    created_at: TS,
  },
];

export const projectAutomations: IProjectAutomation[] = [
  {
    id: "auto_mba_1",
    project_id: "prj_mba",
    name: "Move to In review on PR link",
    trigger: "Pull request opened",
    action: "Set status to In review",
    enabled: true,
    created_at: TS,
  },
  {
    id: "auto_mba_2",
    project_id: "prj_mba",
    name: "Notify assignee on comment",
    trigger: "Comment added",
    action: "Send notification",
    enabled: false,
    created_at: TS,
  },
];

export const customFields: ICustomFieldDefinition[] = [
  {
    id: "cf_mba_1",
    project_id: "prj_mba",
    name: "Severity",
    field_type: ECustomFieldType.Select,
    options: ["Low", "Medium", "High", "Critical"],
    sort_order: 0,
    created_at: TS,
  },
  {
    id: "cf_mba_2",
    project_id: "prj_mba",
    name: "Story points",
    field_type: ECustomFieldType.Number,
    options: null,
    sort_order: 1,
    created_at: TS,
  },
];
