import type { ID, ISODateString } from "@/types/common";
import type { EViewLayout } from "@/types/project/view";

/** Workspace-scoped saved view (not tied to one project). */
export interface IWorkspaceView {
  id: ID;
  workspace_slug: string;
  name: string;
  description: string;
  layout: EViewLayout;
  filter_query: string;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreateWorkspaceViewPayload {
  name: string;
  description?: string;
  layout: EViewLayout;
  filter_query?: string;
}
