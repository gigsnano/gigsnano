import type { ID, ISODateString } from "@/types/common";
import type { EStoryPriority, EStoryStatus, EStoryType, ESize } from "./story";

/** The create-work-item form state persisted in a draft (mirrors the modal). */
export interface IWorkItemDraftPayload {
  title: string;
  description: string;
  type: EStoryType;
  status: EStoryStatus;
  priority: EStoryPriority;
  assignee_id: ID | null;
  label_ids: ID[];
  start_date: string | null;
  target_date: string | null;
  cycle_id: ID | null;
  module_id: ID | null;
  estimate_id: ID | null;
  estimate_points: number | null;
  size: ESize | null;
  duration_minutes: number | null;
  parent_id: ID | null;
}

export interface IWorkItemDraftRecord {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  title: string;
  payload: IWorkItemDraftPayload;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface IUpsertDraftPayload {
  title: string;
  payload: IWorkItemDraftPayload;
}
