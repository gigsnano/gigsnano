import type { ID, ISODateString } from "./common";

export interface IInboxCounts { approvals: number; escalations: number; assigned: number; total: number }
export type TInboxKind = "director_action" | "recovery_plan" | "escalation" | "delegation_review" | "assignment" | "mention";
export type TInboxAction = "approve" | "reject" | "resolve" | "retry" | "open";
export interface IInboxItem {
  id: string; kind: TInboxKind; entity_id: ID; project_id: ID | null; project_name: string | null;
  story_id: ID | null; href: string | null; title: string; subtitle: string;
  created_at: ISODateString; actions: TInboxAction[];
}
export interface IInbox { items: IInboxItem[]; counts: IInboxCounts }
