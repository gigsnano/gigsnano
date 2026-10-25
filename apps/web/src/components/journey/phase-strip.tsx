import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, CircleIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { JOURNEY_PHASE_LABEL, type PhaseView } from "@/lib/journey/derive";

/** Define → Experience → Engineer → Plan → Deliver, with verified progress per phase. */
export function PhaseStrip({ phases }: { phases: PhaseView[] }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Journey phases">
      {phases.map((p, i) => {
        const done = p.state === "complete";
        const active = p.state === "active";
        return (
          <li key={p.phase} className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-colors",
                active && "bg-primary/10 font-semibold text-primary",
                done && "text-emerald-600 dark:text-emerald-400",
                !active && !done && "text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
              ) : active ? (
                <span className="size-2 rounded-full bg-primary" aria-hidden />
              ) : (
                <HugeiconsIcon icon={CircleIcon} className="size-4" />
              )}
              {JOURNEY_PHASE_LABEL[p.phase]}
              {p.total > 0 ? (
                <span className="text-xs tabular-nums opacity-70">
                  {p.verified}/{p.total}
                </span>
              ) : null}
            </span>
            {i < phases.length - 1 ? (
              <span
                className={cn("h-px w-4 shrink-0", done ? "bg-emerald-500/40" : "bg-border")}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
