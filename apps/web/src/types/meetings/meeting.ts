import type { ID, ISODateString } from "@/types/common";

export enum EMeetingPlatform {
  GoogleMeet = "google_meet",
  Teams = "teams",
  Zoom = "zoom",
}

export enum EMeetingStatus {
  Requested = "requested",
  Joining = "joining",
  WaitingAdmission = "waiting_admission",
  InCall = "in_call",
  Ended = "ended",
  Failed = "failed",
}

export type TMeetingNotesStatus = "pending" | "ready" | "failed" | "empty";
export type TActionItemStatus = "pending" | "approved" | "dismissed";
export type TActionItemType = "task" | "feature" | "bug" | "story";

export interface IMeeting {
  id: ID;
  project_id: ID;
  title: string;
  platform: EMeetingPlatform;
  meeting_url: string;
  status: EMeetingStatus;
  failure_reason: string | null;
  started_at: ISODateString | null;
  ended_at: ISODateString | null;
  created_at: ISODateString;
  created_by_id: ID | null;
  summary: string | null;
  notes_status: TMeetingNotesStatus | null;
  pending_action_items: number;
}

export interface IMeetingTranscriptSegment {
  seq: number;
  speaker: string | null;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface IMeetingActionItem {
  id: ID;
  meeting_id: ID;
  status: TActionItemStatus;
  type: TActionItemType;
  title: string;
  description: string;
  quote: string;
  speaker_name: string | null;
  assignee_id: ID | null;
  target_date: string | null;
  created_story_id: ID | null;
  position: number;
}

export interface ICreateMeetingPayload {
  meeting_url: string;
  title?: string;
  consent_acknowledged: true;
}

export type IUpdateMeetingActionItemPayload = Partial<
  Pick<IMeetingActionItem, "title" | "description" | "type" | "assignee_id" | "target_date">
>;
