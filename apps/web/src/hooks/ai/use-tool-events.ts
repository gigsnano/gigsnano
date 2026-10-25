import { useState } from "react";

import type { IGigsToolStreamEvent } from "@/types/ai/gigs-ai";

export type TToolEventStatus = "running" | "confirming" | "resuming" | "done" | "error" | "cancelled";

export interface IToolEventState {
  toolUseId: string;
  name: string;
  input?: unknown;
  status: TToolEventStatus;
  summary?: string;
  /** App-relative deep link to what the tool touched (e.g. the created work item). */
  link?: string;
}

/** A tool that never got a result/confirmation before the stream ended. The
 * `tool_use_id` doubles as the correlation id — it's what the backend logs. */
export const TOOL_STALLED_SUMMARY = "Didn't finish — send the request again";

/** Statuses that are still waiting on the stream (as opposed to waiting on the
 * user, which `confirming` is). Only these get settled when a turn ends. */
const IN_FLIGHT: TToolEventStatus[] = ["running", "resuming"];

/**
 * Tracks `tool_call` / `tool_result` / `tool_confirmation` events for the
 * current chat session, keyed by `tool_use_id` (not tied to a specific
 * assistant message — see `chat-transport.ts`'s `data-tool-event` rewrite,
 * which forwards them here via `onData` as transient chunks rather than
 * message parts). `decide`/`cancel` are local, optimistic — the actual
 * resume happens via `MessageRuntime.reload()` in the chat component.
 */
export function useToolEvents() {
  const [byId, setById] = useState<Record<string, IToolEventState>>({});
  const [order, setOrder] = useState<string[]>([]);

  const ingest = (raw: IGigsToolStreamEvent) => {
    setById((prev) => {
      const existing = prev[raw.tool_use_id];
      const next: IToolEventState =
        raw.type === "tool_result"
          ? {
              toolUseId: raw.tool_use_id,
              name: existing?.name ?? raw.name ?? "tool",
              input: existing?.input ?? raw.input,
              status: raw.is_error ? "error" : "done",
              summary: raw.summary,
              link: raw.link ?? undefined,
            }
          : {
              toolUseId: raw.tool_use_id,
              name: raw.name ?? "tool",
              input: raw.input,
              status: raw.type === "tool_confirmation" ? "confirming" : "running",
            };
      return { ...prev, [raw.tool_use_id]: next };
    });
    setOrder((prev) => (prev.includes(raw.tool_use_id) ? prev : [...prev, raw.tool_use_id]));
  };

  const onData = (part: { type: string; data?: unknown }) => {
    if (part.type !== "data-tool-event" || !part.data) return;
    ingest(part.data as IGigsToolStreamEvent);
  };

  const setStatus = (toolUseId: string, status: TToolEventStatus) => {
    setById((prev) => {
      const existing = prev[toolUseId];
      if (!existing) return prev;
      return { ...prev, [toolUseId]: { ...existing, status } };
    });
  };

  const reset = () => {
    setById({});
    setOrder([]);
  };

  /**
   * Ends the turn's loading states (GIN-478). A tool only leaves `running` /
   * `resuming` when its `tool_result` arrives — so ANY stream that ends without
   * one (backend crash mid-turn, dropped/idle-timed-out SSE connection, aborted
   * request) left a spinner alive forever with no error and no way forward.
   * Call this whenever the chat reaches a terminal state; `confirming` is left
   * alone because it's waiting on the user, not on the stream.
   */
  const settle = () => {
    setById((prev) => {
      const stalled = Object.values(prev).filter((e) => IN_FLIGHT.includes(e.status));
      if (stalled.length === 0) return prev;
      const next = { ...prev };
      for (const event of stalled) {
        next[event.toolUseId] = { ...event, status: "error", summary: TOOL_STALLED_SUMMARY };
      }
      return next;
    });
  };

  const events = order.map((id) => byId[id]).filter((e): e is IToolEventState => e != null);

  return { events, onData, setStatus, reset, settle };
}
