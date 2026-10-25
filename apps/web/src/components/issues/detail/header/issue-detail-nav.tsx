"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function NavKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded border border-background/20 bg-background/15 px-1 py-px font-mono text-[10px] font-medium leading-none text-background/90">
      {children}
    </kbd>
  );
}

function NavButton({
  label,
  shortcut,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  icon: IconSvgElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="t-issue-nav-btn"
          aria-label={label}
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) onClick();
          }}
        >
          <HugeiconsIcon icon={icon} className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="flex items-center">
        {label}
        <NavKbd>{shortcut}</NavKbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** Linear-style prev/next control — instant swaps, press feedback on arrows only. */
export function IssueDetailNav({
  position,
  total,
  prevId,
  nextId,
  onNavigate,
  className,
}: {
  position: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
  onNavigate: (storyId: string) => void;
  className?: string;
}) {
  if (total <= 1) return null;

  const label = position > 0 ? `${position} / ${total}` : `— / ${total}`;

  return (
    <TooltipProvider delayDuration={400}>
      <nav
        className={cn("t-issue-nav", className)}
        aria-label="Work item navigation"
      >
        <span className="t-issue-nav-count" aria-live="polite" aria-atomic="true">
          {label}
        </span>
        <NavButton
          label="Previous"
          shortcut="K"
          disabled={!prevId}
          icon={ArrowUp01Icon}
          onClick={() => prevId && onNavigate(prevId)}
        />
        <NavButton
          label="Next"
          shortcut="J"
          disabled={!nextId}
          icon={ArrowDown01Icon}
          onClick={() => nextId && onNavigate(nextId)}
        />
      </nav>
    </TooltipProvider>
  );
}
