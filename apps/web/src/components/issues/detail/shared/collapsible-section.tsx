"use client";

import { type ReactNode, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Plane-style collapsible section header with optional count badge and action slot. */
export function IssueCollapsibleSection({
  title,
  count,
  defaultOpen = true,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left outline-none",
            "transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.99]",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
          aria-expanded={open}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
              !open && "-rotate-90",
            )}
          />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {count !== undefined && count > 0 ? (
            <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
          ) : null}
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? children : null}
    </section>
  );
}
