"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { AppHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GIGS_AI_MODELS,
  resolveGigsAiModelId,
  useAiPaneStore,
} from "@/store/ui/ai-pane.store";
import { useCreateGigsThread } from "@/hooks/ai/use-gigs-ai";
import { GigsAiChat } from "./gigs-ai-chat";

/** Full-page GigsAI chat — the "open in full window" destination (cleaner, bigger). */
export function GigsAiFull({
  workspaceSlug,
  initialPrompt,
  initialThreadId,
}: {
  workspaceSlug: string;
  /** From the home launcher's `?q=` — auto-sent as the first message (GIN-34). */
  initialPrompt?: string;
  /** From the pane's "open in full" (`?thread=`) — continue that conversation instead
   * of starting a fresh one. */
  initialThreadId?: string;
}) {
  const model = useAiPaneStore((s) => s.model);
  const setModel = useAiPaneStore((s) => s.setModel);
  const modelLabel = GIGS_AI_MODELS.find((m) => m.id === model)?.label ?? "GigsAI";

  // Seed from the pane's thread when expanding; otherwise the effect creates a new one.
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const { mutateAsync: createThread } = useCreateGigsThread(workspaceSlug);
  const createThreadRef = useRef(createThread);
  useEffect(() => {
    createThreadRef.current = createThread;
  });

  useEffect(() => {
    if (threadId !== null) return;

    let cancelled = false;

    const seed = async () => {
      setSeedError(null);
      try {
        const thread = await createThreadRef.current({
          model: resolveGigsAiModelId(useAiPaneStore.getState().model),
        });
        if (!cancelled) setThreadId(thread.id);
      } catch (err) {
        if (!cancelled) {
          setSeedError(err instanceof Error ? err.message : "Could not start a chat");
        }
      }
    };

    void seed();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent/60">
              <HugeiconsIcon icon={AiMagicIcon} className="size-4 text-primary" />
              {modelLabel}
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {GIGS_AI_MODELS.map((m) => (
                <DropdownMenuItem key={m.id} onSelect={() => setModel(m.id)}>
                  <span className="flex-1">{m.label}</span>
                  {m.id === model ? <span className="text-xs text-primary">●</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {threadId ? (
          <GigsAiChat
            key={threadId}
            threadId={threadId}
            workspaceSlug={workspaceSlug}
            initialPrompt={initialPrompt}
            variant="full"
          />
        ) : seedError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">{seedError}</p>
            <Button
              size="sm"
              onClick={() => {
                setSeedError(null);
                void createThread({ model: resolveGigsAiModelId(useAiPaneStore.getState().model) })
                  .then((thread) => setThreadId(thread.id))
                  .catch((err) =>
                    setSeedError(err instanceof Error ? err.message : "Could not start a chat"),
                  );
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Starting a chat…
          </div>
        )}
      </div>
    </div>
  );
}
