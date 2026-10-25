"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface IStoryProposalTarget {
  workspaceSlug: string;
  projectId: string | null;
}

const StoryProposalContext = createContext<IStoryProposalTarget | null>(null);

/** Provides the workspace/project a `StoryProposalCard` should create into. */
export function StoryProposalProvider({
  value,
  children,
}: {
  value: IStoryProposalTarget;
  children: ReactNode;
}) {
  return <StoryProposalContext.Provider value={value}>{children}</StoryProposalContext.Provider>;
}

/** Null when no provider is mounted (e.g. story-chat/agent-chat) — cards render read-only. */
export function useStoryProposalTarget(): IStoryProposalTarget | null {
  return useContext(StoryProposalContext);
}
