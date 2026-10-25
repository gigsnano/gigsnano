import type { ID, ISODateString, IOffsetPage, IOffsetPageFilters } from "@/types/common";
import type { GigsAiModelId } from "@/store/ui/ai-pane.store";

export interface IGigsMessage {
  id: ID;
  role: "user" | "assistant";
  content: string;
  created_at: ISODateString;
}

export interface IGigsThread {
  id: ID;
  workspace_slug: string;
  project_id: ID | null;
  title: string;
  model: GigsAiModelId;
  messages: IGigsMessage[];
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreateGigsThreadPayload {
  project_id?: ID | null;
  model?: GigsAiModelId;
}

export interface IUpdateGigsThreadPayload {
  title?: string;
  model?: GigsAiModelId;
}

export type IGigsThreadPage = IOffsetPage<IGigsThread>;

export type IGigsThreadFilters = IOffsetPageFilters;

export interface IGigsInlineAttachment {
  title: string;
  file_name: string;
  mime_type: string;
  content: string;
}

export interface IGigsChatSendExtras {
  agent_id?: string | null;
  document_ids?: string[];
  attachments?: IGigsInlineAttachment[];
}

/** Raw `tool_call` / `tool_result` / `tool_confirmation` SSE event from the
 * GigsAI agent runner (`gigsnano-api` `_stream_agent_turn`). */
export interface IGigsToolStreamEvent {
  type: "tool_call" | "tool_result" | "tool_confirmation";
  tool_use_id: string;
  name?: string;
  input?: unknown;
  summary?: string;
  is_error?: boolean;
  /** App-relative deep link to what the tool touched (created work item, …). */
  link?: string | null;
}

/** One approve/reject decision sent to `POST .../confirm-tools/`. */
export interface IGigsToolConfirmDecision {
  tool_use_id: string;
  approved: boolean;
}
