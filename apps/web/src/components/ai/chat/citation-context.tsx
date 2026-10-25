// src/components/ai/chat/citation-context.tsx
"use client";

import { createContext, useContext } from "react";

export type CitationCtx = { workspaceSlug: string; projectId: string | null };

const Ctx = createContext<CitationCtx | null>(null);

export function CitationProvider({
  workspaceSlug, projectId, children,
}: CitationCtx & { children: React.ReactNode }) {
  // React Compiler memoizes this; do not hand-wrap in useMemo.
  return <Ctx.Provider value={{ workspaceSlug, projectId }}>{children}</Ctx.Provider>;
}

export function useCitationContext(): CitationCtx {
  return useContext(Ctx) ?? { workspaceSlug: "", projectId: null };
}
