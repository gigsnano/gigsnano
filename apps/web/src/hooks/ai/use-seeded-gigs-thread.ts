"use client";

import { useEffect, useRef, useState } from "react";

import { resolveGigsAiModelId, useAiPaneStore } from "@/store/ui/ai-pane.store";

import { useCreateGigsThread } from "./use-gigs-ai";

/**
 * A GigsAI thread to render a chat into, created on first use.
 *
 * `GigsAiChat` requires a `threadId`, so every surface that mounts it needs the same
 * create-once-on-mount dance. Extracted when the Codebase "Ask" screen became the
 * second caller (GIN-155) — the alternative was pasting the effect a second time.
 *
 * Pass `initialThreadId` to adopt an existing thread (e.g. expanding the pane into a
 * full page) and skip creation entirely.
 *
 * `projectId` binds the new thread to a project so the agent's situation
 * (repo/index/docs) resolves against it. Omitting it is why the Codebase "Ask"
 * screen falsely reported "no repository connected" — the thread had no project,
 * so `build_situation(thread.project_id=None)` saw no repo (GIN-312).
 */
export function useSeededGigsThread(
  workspaceSlug: string,
  initialThreadId?: string | null,
  projectId?: string | null,
) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so a new mutation identity can't re-trigger the effect and create a
  // second thread.
  const { mutateAsync: createThread } = useCreateGigsThread(workspaceSlug);
  const createThreadRef = useRef(createThread);
  useEffect(() => {
    createThreadRef.current = createThread;
  });

  useEffect(() => {
    if (threadId !== null) return;
    let cancelled = false;

    const seed = async () => {
      setError(null);
      try {
        const thread = await createThreadRef.current({
          model: resolveGigsAiModelId(useAiPaneStore.getState().model),
          project_id: projectId ?? null,
        });
        if (!cancelled) setThreadId(thread.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start a chat");
      }
    };

    void seed();
    return () => {
      cancelled = true;
    };
  }, [threadId, projectId]);

  return { threadId, error };
}
