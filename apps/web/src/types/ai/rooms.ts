import type { ID, ISODateString, IOffsetPage, IOffsetPageFilters } from "@/types/common";

export interface IExpert {
  id: string;
  name: string;
  persona: string;
  domain: string;
  avatar_color: string;
}

export interface IRoomMessage {
  id: ID;
  role: "user" | "assistant";
  speaker: string | null;
  content: string;
  created_at: ISODateString;
}

export interface IRoom {
  id: ID;
  workspace_slug: string;
  title: string;
  participant_agent_ids: string[];
  messages: IRoomMessage[];
  created_at: ISODateString;
  updated_at: ISODateString;
}

export type IRoomPage = IOffsetPage<IRoom>;
export type IRoomFilters = IOffsetPageFilters;

export interface ICreateRoomPayload {
  title?: string;
  participant_agent_ids?: string[];
}

export interface IAddParticipantPayload {
  agent_id: string;
}
