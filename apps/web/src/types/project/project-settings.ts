import type { ID, ISODateString } from "@/types/common";
import type { TPlanningMethod } from "./project";

export enum EStateGroup {
  Backlog = "backlog",
  Unstarted = "unstarted",
  Started = "started",
  Completed = "completed",
  Cancelled = "cancelled",
}

export enum ECustomFieldType {
  Text = "text",
  Number = "number",
  Date = "date",
  Select = "select",
}

export interface IProjectLabel {
  id: ID;
  project_id: ID;
  name: string;
  color: string;
  created_at: ISODateString;
}

export interface IProjectState {
  id: ID;
  project_id: ID;
  name: string;
  color: string;
  group: EStateGroup;
  order: number;
}

export interface IProjectFeature {
  id: ID;
  project_id: ID;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface IUpdateProjectPayload {
  name?: string;
  description?: string;
  /** Rich-text (HTML) Overview body. */
  overview?: string;
  identifier?: string;
  has_ui?: boolean;
  start_date?: string;
  target_date?: string;
  /** Reassign the project lead (GIN-487) — must be an active project member. */
  lead_id?: ID | null;
  cover_image_url?: string;
  logo_emoji?: string | null;
  logo_color?: string | null;
  logo_image_url?: string | null;
  planning_method?: TPlanningMethod;
}

export interface ICreateProjectLabelPayload {
  name: string;
  color: string;
}

export interface ICreateProjectStatePayload {
  name: string;
  color: string;
  group: EStateGroup;
}

export interface IProjectEstimate {
  id: ID;
  project_id: ID;
  name: string;
  type: "points" | "hours" | "days";
  description: string;
  created_at: ISODateString;
}

export interface IProjectAutomation {
  id: ID;
  project_id: ID;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  created_at: ISODateString;
}

export interface ICreateProjectEstimatePayload {
  name: string;
  type: "points" | "hours" | "days";
  description?: string;
}

export interface ICreateProjectAutomationPayload {
  name: string;
  trigger: string;
  action: string;
}

export interface ICustomFieldDefinition {
  id: ID;
  project_id: ID;
  name: string;
  field_type: ECustomFieldType;
  options: string[] | null;
  sort_order: number;
  created_at: ISODateString;
}

export interface ICreateCustomFieldPayload {
  name: string;
  field_type: ECustomFieldType;
  options?: string[] | null;
  sort_order?: number;
}

export interface IUpdateCustomFieldPayload {
  name?: string;
  options?: string[] | null;
  sort_order?: number;
}
