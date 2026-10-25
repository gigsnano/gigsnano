import type { ID, ISODateString } from "../common";

export type TApproverKind = "human" | "persona";
export type TOnConcerns = "block" | "warn" | "allow";

export interface IWorkflowRule {
  id: ID;
  /** "" = any source state. */
  from_status: string;
  to_status: string;
  approver_kind: TApproverKind;
  /** Role name (human) or BMAD agent id (persona). */
  approver_ref: string;
  on_concerns: TOnConcerns;
  enabled: boolean;
  created_at: ISODateString;
}

export interface ICreateWorkflowRulePayload {
  from_status?: string;
  to_status: string;
  approver_kind: TApproverKind;
  approver_ref: string;
  on_concerns?: TOnConcerns;
  enabled?: boolean;
}
