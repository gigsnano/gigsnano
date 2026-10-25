import type { ID, ISODateString } from "@/types/common";

export interface ISticky {
  id: ID;
  workspace_slug: string;
  body: string;
  color: string;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreateStickyPayload {
  body: string;
  color?: string;
}

export interface IUpdateStickyPayload {
  body?: string;
  color?: string;
}
