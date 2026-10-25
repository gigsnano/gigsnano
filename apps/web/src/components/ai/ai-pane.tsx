"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PencilEdit02Icon,
  Clock01Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GIGS_AI_MODELS,
  registerAiPaneOpenListener,
  resolveGigsAiModelId,
  useAiPaneStore,
} from "@/store/ui/ai-pane.store";
import { useCreateGigsThread, useGigsThreads, useUpdateGigsThread } from "@/hooks/ai/use-gigs-ai";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { isBelow } from "@/lib/layout/breakpoints";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { GigsAiChat } from "./gigs-ai-chat";

/**
 * The GigsAI assistant pane — a full-height column that slides in from the right
 * (3rd grid column of `.workspace-card`), flushing the content + secondary
 * header. Header: model selector · new chat · history · open-in-full · close.
 */
export function AiPane({ workspaceSlug }: { workspaceSlug: string }) {
  const open = useAiPaneStore((s) => s.open);
  const setOpen = useAiPaneStore((s) => s.setOpen);
  const expanded = useAiPaneStore((s) => s.expanded);
  const toggleExpanded = useAiPaneStore((s) => s.toggleExpanded);
  const model = useAiPaneStore((s) => s.model);
  const setModel = useAiPaneStore((s) => s.setModel);
  const params = useParams<{ projectId?: string }>();
  const [threadId, setThreadId] = useState<string | null>(null);
  const paneRef = useRef<HTMLElement>(null);

  const create = useCreateGigsThread(workspaceSlug);
  const update = useUpdateGigsThread(workspaceSlug);
  const { setOffset: setThreadOffset, pageFilters: threadPageFilters } = useOffsetPagination(20);
  const { data: threadPage } = useGigsThreads(workspaceSlug, threadPageFilters, { enabled: open });
  const threads = threadPage?.items ?? [];

  // Keep the latest values in a single ref (written in an effect, not during
  // render) so the mount-once open listener always reads fresh state.
  const latestRef = useRef({ threadId, create, projectId: params.projectId, model });
  useEffect(() => {
    latestRef.current = { threadId, create, projectId: params.projectId, model };
  });

  useEffect(
    () =>
      registerAiPaneOpenListener(() => {
        const { threadId: tid, create: c, projectId: pid, model: m } = latestRef.current;
        if (tid !== null || c.isPending) return;
        c.mutate(
          { project_id: pid ?? null, model: resolveGigsAiModelId(m) },
          { onSuccess: (t) => setThreadId(t.id) },
        );
      }),
    [],
  );

  if (!open) return null;

  const modelLabel = GIGS_AI_MODELS.find((m) => m.id === model)?.label ?? "GigsAI";

  const newChat = () =>
    create.mutate(
      { project_id: params.projectId ?? null, model: resolveGigsAiModelId(model) },
      { onSuccess: (t) => setThreadId(t.id) },
    );

  // Below lg the pane is an overlay sheet (a full-screen one on phones), so it
  // slides back out before unmounting. At lg+ it is a grid column that the
  // track animation already closes.
  const close = () => {
    const el = paneRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduced || !isBelow("lg")) {
      setOpen(false);
      return;
    }
    el.animate([{ transform: "none" }, { transform: "translateX(100%)" }], {
      duration: 180,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      fill: "forwards",
    }).finished.then(() => setOpen(false), () => setOpen(false));
  };

  const pickModel = (id: typeof model) => {
    setModel(id);
    if (threadId) update.mutate({ threadId, payload: { model: id } });
  };

  return (
    <aside ref={paneRef} aria-label="GigsAI" className="ai-pane h-full">
      <div className="flex h-full flex-col border-l bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-accent/60">
              {modelLabel}
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {GIGS_AI_MODELS.map((m) => (
                <DropdownMenuItem key={m.id} onSelect={() => pickModel(m.id)}>
                  <span className="flex-1">{m.label}</span>
                  {m.id === model ? <span className="text-xs text-primary">●</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-0.5">
            <IconButton label="New chat" icon={PencilEdit02Icon} onClick={newChat} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="History" title="History">
                  <HugeiconsIcon icon={Clock01Icon} className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {threads.length ? (
                  <>
                    <div className="max-h-64 overflow-y-auto">
                      {threads.map((t) => (
                        <DropdownMenuItem key={t.id} onSelect={() => setThreadId(t.id)}>
                          <span className="truncate">{t.title}</span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                    {(threadPage?.total ?? 0) > (threadPage?.limit ?? 20) ? (
                      <div className="border-t px-2 py-1.5">
                        <OffsetPagination
                          offset={threadPage?.offset ?? 0}
                          limit={threadPage?.limit ?? 20}
                          total={threadPage?.total ?? 0}
                          onOffsetChange={setThreadOffset}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No past chats.</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Phones already show the pane full screen. */}
            <IconButton
              label={expanded ? "Shrink" : "Expand"}
              icon={expanded ? ArrowShrink01Icon : ArrowExpand01Icon}
              onClick={toggleExpanded}
              className="max-md:hidden"
            />
            <IconButton label="Close" icon={Cancel01Icon} onClick={close} />
          </div>
        </header>

        {threadId ? (
          <GigsAiChat
            key={threadId}
            threadId={threadId}
            workspaceSlug={workspaceSlug}
            projectId={params.projectId}
            variant="pane"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Starting a chat…
          </div>
        )}
      </div>
    </aside>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: typeof Clock01Icon;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} className={className}>
      <HugeiconsIcon icon={icon} className="size-4" />
    </Button>
  );
}
