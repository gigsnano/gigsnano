import type { ID, ISODateString } from "@/types/common";
import { EMemberStatus } from "@/types/workspace/member";

export enum EWorkspaceRole {
  Guest = "guest",
  Member = "member",
  Admin = "admin",
  Owner = "owner",
}

/** A non-working day. The date is what charts read; the name is for humans. */
export interface IWorkspaceHoliday {
  /** `YYYY-MM-DD`. Server keeps the list deduped by date and sorted. */
  date: string;
  name: string;
}

export interface IWorkspace {
  id: ID;
  slug: string;
  name: string;
  logo_url: string | null;
  member_count: number;
  project_count: number;
  github_connected: boolean;
  github_repo_url: string | null;
  /** Workspace holiday calendar — per workspace because a UAE tenant and an
   *  Indian one share almost no public holidays. */
  holidays: IWorkspaceHoliday[];
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface IWorkspaceMember {
  id: ID;
  workspace_slug: string;
  user_id: ID;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role: EWorkspaceRole;
  status: EMemberStatus;
  /** Joined date, or invited date for a row standing in for a pending
   *  invitation — the members table renders one column for both. */
  created_at: ISODateString;
}
