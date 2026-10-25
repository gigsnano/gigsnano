"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { IToolEventState, TToolEventStatus } from "@/hooks/ai/use-tool-events";

interface IToolEventsCtx {
  events: IToolEventState[];
  setStatus: (toolUseId: string, status: TToolEventStatus) => void;
  /** Resumes a paused tool-confirmation turn (GIN-269). Optional: surfaces that
   * don't wire up a confirm-capable transport (e.g. the BMAD story chat, which
   * doesn't pass `confirmToolsUrl`) can omit it — `decide` just no-ops. */
  resume?: (toolUseId: string, approved: boolean) => void;
}

const ToolEventsContext = createContext<IToolEventsCtx | null>(null);

/** Exposes the current turn's tool events so they can be rendered inline inside
 * the latest assistant message (see `MessageToolEvents`) instead of a detached
 * strip at the bottom of the thread. */
export function ToolEventsProvider({
  value,
  children,
}: {
  value: IToolEventsCtx;
  children: ReactNode;
}) {
  return <ToolEventsContext.Provider value={value}>{children}</ToolEventsContext.Provider>;
}

/** Null when no provider is mounted (e.g. surfaces without agentic tools). */
export function useToolEventsCtx(): IToolEventsCtx | null {
  return useContext(ToolEventsContext);
}
