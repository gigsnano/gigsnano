"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// CODEBASE_VIEW_IDS is shared with the tab switcher — a local copy silently
// diverged once and made a rendered tab unclickable (its `?view=` value wasn't in
// the whitelist, so it fell through to "overview").
import { CODEBASE_VIEW_IDS } from "@/constants/codebase-views";
import { emptyFilters, type ICodebaseFilters } from "@/lib/code/graph-filter";
import type { CodebaseViewId } from "@/types/code/intelligence";

/**
 * Workspace UI state: the active view lives in `?view=` (shareable / back-button
 * friendly); selection, filters, and panel collapse are local. Consumers must be
 * wrapped in <Suspense> because of `useSearchParams`.
 */
export function useCodebaseWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("view");
  const view: CodebaseViewId = CODEBASE_VIEW_IDS.includes(raw as CodebaseViewId)
    ? (raw as CodebaseViewId)
    : "overview";

  // Plain functions — React Compiler memoizes; no hand-rolled useCallback.
  function setView(v: CodebaseViewId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const [selectedId, select] = useState<string | null>(null);
  const [filters, setFilters] = useState<ICodebaseFilters>(emptyFilters);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  return {
    view,
    setView,
    selectedId,
    select,
    filters,
    setFilters,
    explorerOpen,
    toggleExplorer: () => setExplorerOpen((o) => !o),
    inspectorOpen,
    toggleInspector: () => setInspectorOpen((o) => !o),
  };
}
