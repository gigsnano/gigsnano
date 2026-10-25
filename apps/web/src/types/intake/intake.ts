import type { ID, ISODateString } from "../common";
import type { EStoryPriority } from "../story/story";

/** Where an inbound request came from (mirrors the API's triage_source enum). */
export enum ETriageSource {
  Personal = "personal",
  InApp = "in_app",
  PublicForm = "public_form",
  Email = "email",
  Customer = "customer",
}

/** Lifecycle of a triage item — never a Story until Accepted. */
export enum ETriageStatus {
  New = "new",
  Triaged = "triaged",
  Accepted = "accepted",
  Dismissed = "dismissed",
}

/** Where an accepted item is routed. */
export type TTriageRoute = "persona" | "team" | "gig";

/** A grounded duplicate match (title ILIKE over the workspace's work items). */
export interface IDuplicateRef {
  story_id: ID;
  story_number: number;
  title: string;
}

/** The Analyst's routing recommendation — output of the task router. */
export interface IRecommendedRoute {
  domain: string;
  task_type: string;
  persona_id: string;
  persona_name: string;
  skills: string[];
  confidence: "high" | "medium" | "low";
  rationale: string;
  route?: TTriageRoute;
}

export interface ITriageItem {
  id: ID;
  workspace_slug: string;
  project_id: ID | null;
  source: ETriageSource;
  is_public: boolean;
  status: ETriageStatus;
  title: string;
  body: string;
  customer_id: ID | null;
  classification: { domain?: string; task_type?: string };
  enriched_title: string | null;
  enriched_description: string | null;
  priority: EStoryPriority | null;
  duplicate_ids: IDuplicateRef[];
  recommended_route: IRecommendedRoute | Record<string, never>;
  created_story_id: ID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICustomer {
  id: ID;
  name: string;
  email: string | null;
  priority_weight: number;
  notes: string | null;
  created_at: ISODateString;
}

export interface ICreateCustomerPayload {
  name: string;
  email?: string | null;
  priority_weight?: number;
  notes?: string | null;
}

/** Unauthenticated public-form submission (workspace derived from the token). */
export interface IPublicIntakePayload {
  title: string;
  body?: string;
  email?: string | null;
}

/** A minted, shareable public-intake link. */
export interface IIntakeLink {
  token: string;
  url: string;
}

export interface ICaptureTriagePayload {
  title: string;
  body?: string;
  source?: ETriageSource;
  is_public?: boolean;
  project_id?: ID | null;
  customer_id?: ID | null;
}

export interface IAcceptTriagePayload {
  project_id?: ID | null;
  route?: TTriageRoute | null;
  assignee_id?: ID | null;
  status?: string;
  /**
   * Optional edited draft. ponytail: the deployed `accept` endpoint publishes
   * from the item's enriched fields and ignores unknown keys, so these override
   * only in the mock today — one backend line (honor title/description on accept)
   * makes edited drafts persist against the real API too.
   */
  title?: string;
  description?: string;
}
