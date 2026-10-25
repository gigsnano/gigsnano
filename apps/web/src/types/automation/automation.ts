import type { ID, ISODateString } from "../common";

export type TTriggerEvent = "story.created" | "story.updated" | "schedule";
export type TConditionOp = "eq" | "neq" | "contains" | "in";
export type TActionType =
  | "set_field"
  | "assign_persona"
  | "create_work_item"
  | "comment"
  | "create_from_template";

export interface IAutomationCondition {
  field: string;
  op: TConditionOp;
  value: string | string[];
}

export interface IAutomationAction {
  type: TActionType;
  params: Record<string, unknown>;
}

/** Compiled rule (NL → AST). `unsupported` surfaces asks that aren't in the action
 * allowlist — flagged, never silently dropped. */
export interface IAutomationAst {
  trigger: TTriggerEvent;
  conditions: IAutomationCondition[];
  actions: IAutomationAction[];
  unsupported: string[];
}

export interface IAutomationRule {
  id: ID;
  project_id: ID;
  name: string;
  source_text: string;
  trigger_event: string;
  ast: IAutomationAst;
  enabled: boolean;
  created_at: ISODateString;
}

export interface ICreateAutomationPayload {
  name: string;
  text: string;
  enabled?: boolean;
}

export interface IUpdateAutomationPayload {
  name?: string;
  enabled?: boolean;
}

export interface IAutomationRun {
  id: ID;
  automation_id: ID | null;
  trigger_event: string;
  story_id: ID | null;
  dry_run: boolean;
  status: string;
  actions_taken: unknown[];
  created_at: ISODateString;
}
