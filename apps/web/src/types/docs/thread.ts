import type { ID, ISODateString } from "@/types/common";
import type { IDocument } from "@/types/docs/document";
import type { IStory } from "@/types/story/story";

/** Known `WorkflowSession.state` values — kept as a loose string so an
 * unrecognized future backend state degrades gracefully instead of failing
 * a type check. Compare against `EThreadState` members for known cases. */
export const EThreadState = {
  Conversing: "conversing",
  ReadyToFinalize: "ready_to_finalize",
  Failed: "failed",
  Completed: "completed",
} as const;

/**
 * True once the workflow is finalized (or finalizing) — the backend rejects any
 * further chat turn on such a session with 409 "Session is completed". The chat
 * UI must swap its composer for a finalized notice instead of sending into that
 * wall (which otherwise leaves the message spinning forever). "finalizing" is the
 * brief transitional state the backend sets during finalize; it 409s the same.
 */
export function isFinalizedThreadState(state: string): boolean {
  return state === EThreadState.Completed || state === "finalizing";
}

export interface IThreadMessage {
  id: ID;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: ISODateString;
}

/** A BMAD agent chat thread backing one Sprint-0 story (`WorkflowSession`). */
export interface IThreadOut {
  id: ID;
  story_id: ID;
  workflow_id: string;
  agent: string;
  state: string;
  messages: IThreadMessage[];
}

export interface IFinalizeThreadResult {
  artifact_id: ID;
  document: IDocument;
  story: IStory;
}

export interface IFinalizeDescriptionResult {
  story: IStory;
}
