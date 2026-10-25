import type { ID, ISODateString } from "../common";

export type TTemplateKind = "project" | "work_item";
export type TTemplateVisibility = "private" | "public";
export type TRecurrenceUnit = "minutes" | "hours" | "days";

export interface ITemplate {
  id: ID;
  workspace_id: ID;
  kind: TTemplateKind;
  name: string;
  visibility: TTemplateVisibility;
  content: Record<string, unknown>;
  version: number;
  created_at: ISODateString;
}

export interface ICreateTemplatePayload {
  kind: TTemplateKind;
  name: string;
  visibility?: TTemplateVisibility;
  content?: Record<string, unknown>;
}

export interface IUpdateTemplatePayload {
  name?: string;
  visibility?: TTemplateVisibility;
  content?: Record<string, unknown>;
}

/** AI draft of a work-item template (unsaved). */
export interface ITemplateDraft {
  kind: TTemplateKind;
  name: string;
  content: Record<string, unknown>;
}

/** A recurrence = a schedule-trigger automation rule that spawns from a template. */
export interface IRecurrence {
  id: ID;
  name: string;
  template_id: ID | null;
  every: number | null;
  unit: TRecurrenceUnit | null;
  next_run_at: ISODateString | null;
  enabled: boolean;
  created_at: ISODateString;
}

export interface ICreateRecurrencePayload {
  template_id: ID;
  every: number;
  unit: TRecurrenceUnit;
}
