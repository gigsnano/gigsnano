"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Marks an AI output as grounded (backed by ≥1 citation) or ungrounded (GIN-203).
 * Pairs with the clickable citation pills (citation.tsx) — this is the at-a-glance
 * trust signal; the pills are the checkable evidence. */
export function GroundedBadge({
  citationCount,
  className,
}: {
  citationCount: number;
  className?: string;
}) {
  const grounded = citationCount > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        grounded ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        grounded ? `Grounded in ${citationCount} source${citationCount === 1 ? "" : "s"}` : "Ungrounded — no sources"
      }
    >
      {grounded ? (
        <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={2.5} />
      ) : null}
      {grounded ? "Grounded" : "Ungrounded"}
    </span>
  );
}
