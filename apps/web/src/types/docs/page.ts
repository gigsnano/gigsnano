import type { ID, ISODateString } from "@/types/common";

export type TPageContentFormat = "json" | "html" | "markdown";

export interface IPage {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  title: string;
  content: string;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreatePagePayload {
  title: string;
  content?: string;
  content_format?: TPageContentFormat;
}

export interface IUpdatePagePayload {
  title?: string;
  content?: string;
  content_format?: TPageContentFormat;
  /** Optimistic-concurrency guard (GIN-24): the `updated_at` this edit was loaded
   * from. A mismatch means someone else saved first -> the API rejects with 409
   * instead of silently clobbering their change. */
  if_updated_at?: ISODateString;
}

export interface IPageWithProject extends IPage {
  project_name: string;
}

/** One other person currently viewing/editing a page (GIN-24 presence v1). */
export interface IPagePresenceViewer {
  user_id: ID;
  display_name: string;
  avatar_url: string | null;
  editing: boolean;
  last_seen: ISODateString;
}

export interface IPagePresence {
  viewers: IPagePresenceViewer[];
}
