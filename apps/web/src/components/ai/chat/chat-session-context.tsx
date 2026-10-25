"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Carries the workflow session's terminal state down to message-rendered
 * widgets (assistant-ui renders `BmadResponseParts` internally, so props can't
 * be threaded in). When finalized, inline choice/answer widgets must render
 * inert — appending a turn to a completed session 409s and would spin forever.
 */
const ChatSessionContext = createContext<{ isFinalized: boolean }>({ isFinalized: false });

export function ChatSessionProvider({
  isFinalized,
  children,
}: {
  isFinalized: boolean;
  children: ReactNode;
}) {
  return (
    <ChatSessionContext.Provider value={{ isFinalized }}>{children}</ChatSessionContext.Provider>
  );
}

export function useChatSession() {
  return useContext(ChatSessionContext);
}
