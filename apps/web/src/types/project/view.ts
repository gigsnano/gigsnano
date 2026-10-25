import type { ID, ISODateString } from "@/types/common";

export enum EViewLayout {
  Board = "board",
  List = "list",
  Table = "table",
}

export enum EViewShareScope {
  Private = "private",
  Project = "project",
}

export interface IProjectView {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  name: string;
  description: string;
  layout: EViewLayout;
  /** Filter query string for the view. */
  filter_query: string;
  owner_id: ID;
  owner_name: string;
  share_scope: EViewShareScope;
  is_favorite: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreateViewPayload {
  name: string;
  description?: string;
  layout: EViewLayout;
  filter_query?: string;
  share_scope?: EViewShareScope;
}

export interface IUpdateViewPayload {
  name?: string;
  description?: string;
  layout?: EViewLayout;
  filter_query?: string;
  share_scope?: EViewShareScope;
}
