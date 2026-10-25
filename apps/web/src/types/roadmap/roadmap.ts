import type { ID, ISODateString } from "../common";

export type TSlipSignal = "on_track" | "at_risk" | "off_track";

export interface IRoadmapRollup {
  total: number;
  done: number;
  progress_pct: number;
  slip_signal: TSlipSignal;
  slip_reason: string;
}

export interface IInitiative {
  id: ID;
  workspace_id: ID;
  title: string;
  description: string;
  status: string;
  lead_id: ID | null;
  /** ISO date (YYYY-MM-DD) or null. */
  target_date: string | null;
  created_at: ISODateString;
}

export interface ICreateInitiativePayload {
  title: string;
  description?: string;
  status?: string;
  lead_id?: ID | null;
  target_date?: string | null;
}

export type IUpdateInitiativePayload = Partial<ICreateInitiativePayload>;

/** An AI-drafted (unsaved) initiative from draft-initiatives. */
export interface IDraftedInitiative {
  title: string;
  description: string;
}
export interface IInitiativesDraft {
  initiatives: IDraftedInitiative[];
}

export interface IRelease {
  id: ID;
  project_id: ID;
  version: string;
  name: string;
  changelog_md: string;
  status: string;
  released_at: ISODateString | null;
  created_at: ISODateString;
}

export interface ICreateReleasePayload {
  version: string;
  name?: string;
  status?: string;
}

export interface IUpdateReleasePayload {
  version?: string;
  name?: string;
  changelog_md?: string;
  status?: string;
}

export interface ILinkStoriesPayload {
  story_ids: ID[];
}
