import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { toolRunningLabel } from "@/lib/ai/tool-labels";
import type { IToolEventState } from "@/hooks/ai/use-tool-events";

/** Compact status chip for an in-flight or finished tool call — resolves
 * "Searching work items…" to the backend's `tool_result.summary` ("Found 3"). */
export function ToolStatusChip({ event }: { event: IToolEventState }) {
  const isError = event.status === "error";
  const isCancelled = event.status === "cancelled";
  const isDone = event.status === "done";

  const label = isCancelled
    ? "Cancelled"
    : isDone || isError
      ? (event.summary ?? toolRunningLabel(event.name))
      : toolRunningLabel(event.name);

  return (
    <div
      // The tool_use_id is the correlation id the backend logs against this call —
      // surfaced on hover so a failure can be traced without dev tools (GIN-478).
      title={isError ? `Reference: ${event.toolUseId}` : undefined}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        isError
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border/60 bg-muted/60 text-muted-foreground",
      )}
    >
      {isDone ? (
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : isError ? (
        <HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
      ) : isCancelled ? null : (
        <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      )}
      {/* A write tool reports where it landed (`link`) — make the summary the way
          in, so "Created GIN-42" opens GIN-42 instead of leaving the user to hunt. */}
      {isDone && event.link ? (
        <Link href={event.link} className="font-medium text-foreground underline-offset-2 hover:underline">
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
