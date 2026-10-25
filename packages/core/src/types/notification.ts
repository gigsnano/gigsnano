import type { ID, ISODateString, IOffsetPage, IOffsetPageFilters } from "./common";

export enum ENotificationKind {
  Mention = "mention",
  Assignment = "assignment",
  Sprint = "sprint",
  System = "system",
  Review = "review", // GIN-293: review/approval-gate events (readiness gates)
  Agent = "agent", // GIN-293: AI-agent run lifecycle (completed/failed/needs-input)
}

export interface INotificationActor {
  id: ID;
  display_name: string;
  avatar_url: string | null;
}

export interface INotificationProjectRef {
  id: ID;
  name: string;
}

export interface INotification {
  id: ID;
  workspace_slug: string;
  kind: ENotificationKind;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: ISODateString;
  actor: INotificationActor | null;
  project: INotificationProjectRef | null;
}

export interface IUnreadNotificationsCount {
  total_unread: number;
  mention_unread: number;
}

export type INotificationPage = IOffsetPage<INotification>;

/**
 * Inbox primary filter tabs (GIN-270). Server-authoritative: the API `category`
 * param owns the tab → kind mapping so it can gain review/agent kinds later
 * without a frontend change. "reviews" has no backing event kind yet.
 */
export type ENotificationCategory =
  | "all"
  | "unread"
  | "mentions"
  | "assigned"
  | "reviews"
  | "agent_system";

export interface INotificationFilters extends IOffsetPageFilters {
  category?: ENotificationCategory;
}
