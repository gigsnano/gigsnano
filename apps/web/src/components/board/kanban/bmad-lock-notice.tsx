"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SquareLock01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { IBmadLockMessage } from "@/lib/bmad/bmad-unlock";

/** Always-visible lock callout on a blocked BMAD kanban card. */
export function BmadLockNotice({
  message,
  shaking = false,
}: {
  message: IBmadLockMessage;
  shaking?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5",
        shaking && "t-error is-shaking",
      )}
      role="status"
    >
      <HugeiconsIcon
        icon={SquareLock01Icon}
        className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300"
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] font-semibold leading-snug text-amber-950 dark:text-amber-50">
          {message.badge}
        </p>
        <p className="text-[10px] leading-snug text-amber-900/80 dark:text-amber-100/80">
          {message.detail}
        </p>
        {message.action ? (
          <p className="text-[10px] font-medium leading-snug text-primary">{message.action}</p>
        ) : null}
      </div>
    </div>
  );
}
