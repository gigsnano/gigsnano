"use client";

import { useMessage } from "@assistant-ui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { toolRunningLabel } from "@/lib/ai/tool-labels";
import { useToolEventsCtx } from "./tool-events-context";
import { ToolConfirmCard } from "./tool-confirm-card";
import { ToolStatusChip } from "./tool-status-chip";

/**
 * Renders the current turn's tool activity INSIDE the latest assistant message,
 * so it reads as part of that response rather than a detached strip at the
 * bottom of the thread. Only the last message renders it — the tool-event state
 * belongs to the response currently being generated.
 *
 * The raw tool trace (greps, tree walks, file reads) is the agent's "thinking"
 * and is NOT surfaced by default: status events fold into a single quiet,
 * collapsible disclosure ("Working…" while live, "Worked on this · N steps"
 * when done) that the user can expand on demand. Confirm cards stay OUTSIDE the
 * disclosure — they need a decision, so they're always visible. A decision
 * resumes the paused turn via `ctx.resume()` (see `gigs-ai-chat.tsx`'s
 * `chat.regenerate()` + `chat-transport.ts`'s `extractConfirmDecisions`).
 */
export function MessageToolEvents() {
  const ctx = useToolEventsCtx();
  const isLast = useMessage((m) => m.isLast);

  if (!ctx || !isLast || ctx.events.length === 0) return null;

  const decide = (toolUseId: string, approved: boolean) => {
    ctx.resume?.(toolUseId, approved);
  };

  const confirmEvents = ctx.events.filter(
    (e) => e.status === "confirming" || e.status === "resuming",
  );
  const statusEvents = ctx.events.filter(
    (e) => e.status !== "confirming" && e.status !== "resuming",
  );

  const running = statusEvents.find((e) => e.status === "running");
  const failed = statusEvents.filter((e) => e.status === "error").length;
  const steps = `${statusEvents.length} ${statusEvents.length === 1 ? "step" : "steps"}`;
  // A failure must not hide behind the collapsed "Worked on this" line — say so on
  // the summary itself so the user knows to expand (GIN-478).
  const summaryText = running
    ? toolRunningLabel(running.name)
    : failed
      ? `${failed} of ${steps} didn't finish`
      : `Worked on this · ${steps}`;

  return (
    <div className="mb-1.5 flex flex-col items-start gap-1.5">
      {confirmEvents.map((event) => (
        <ToolConfirmCard
          key={event.toolUseId}
          event={event}
          onApprove={() => decide(event.toolUseId, true)}
          onCancel={() => decide(event.toolUseId, false)}
        />
      ))}

      {statusEvents.length > 0 ? (
        <details className="group w-full">
          <summary
            className={cn(
              "flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors [&::-webkit-details-marker]:hidden",
              failed && !running
                ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                : "border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {running ? (
              <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            ) : (
              <HugeiconsIcon icon={AiMagicIcon} className="size-3.5 shrink-0" />
            )}
            <span>{summaryText}</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-open:rotate-90"
            />
          </summary>
          <div className="mt-1.5 flex flex-col items-start gap-1.5 border-l border-border/50 pl-3">
            {statusEvents.map((event) => (
              <ToolStatusChip key={event.toolUseId} event={event} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
