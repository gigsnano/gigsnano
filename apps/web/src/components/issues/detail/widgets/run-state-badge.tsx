"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Loading03Icon,
  UserQuestion01Icon,
} from "@hugeicons/core-free-icons";

import { RUN_STATE_LABEL, type TAgentRunDisplayState } from "@/lib/issues/agent-run-state";
import { cn } from "@/lib/utils";

/**
 * Run state as icon + word (GIN-482).
 *
 * Both, always: a red pill alone tells a reader who cannot distinguish red that
 * something is fine. The semantic ramp carries the tone; the accent colour is
 * reserved for the page's primary action.
 */
const META: Record<
  TAgentRunDisplayState,
  { icon: typeof Alert02Icon; className: string; spin?: boolean }
> = {
  queued: { icon: Clock01Icon, className: "bg-muted text-muted-foreground" },
  planning: { icon: Loading03Icon, className: "bg-muted text-foreground", spin: true },
  executing: { icon: Loading03Icon, className: "bg-muted text-foreground", spin: true },
  awaiting_review: { icon: UserQuestion01Icon, className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  done: { icon: CheckmarkCircle02Icon, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  failed: { icon: Alert02Icon, className: "bg-destructive/10 text-destructive" },
  stopped: { icon: Clock01Icon, className: "bg-muted text-muted-foreground" },
  stale: { icon: Alert02Icon, className: "bg-destructive/10 text-destructive" },
};

export function RunStateBadge({
  state,
  className,
}: {
  state: TAgentRunDisplayState;
  className?: string;
}) {
  const meta = META[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      <HugeiconsIcon
        icon={meta.icon}
        className={cn("size-3", meta.spin && "motion-safe:animate-spin")}
        aria-hidden
      />
      {RUN_STATE_LABEL[state]}
    </span>
  );
}
