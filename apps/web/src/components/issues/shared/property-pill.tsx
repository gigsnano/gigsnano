"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PropertyPillProps extends ComponentPropsWithoutRef<"button"> {
  icon?: ReactNode;
  active?: boolean;
}

/**
 * Plane create-modal property chip — outlined `border-with-text` look.
 * A filled value reads in `text-foreground`; an empty one stays muted.
 *
 * MUST forward its ref and spread received props onto the `<button>`: every
 * create-modal field renders it via Radix `<…Trigger asChild>`, whose `Slot`
 * injects the ref plus the pointer/keyboard/aria props that open the menu.
 * Dropping them silently disables every picker (see G-57).
 */
export const PropertyPill = forwardRef<HTMLButtonElement, PropertyPillProps>(
  function PropertyPill({ icon, active = false, className, children, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "gn-dialog-form-chip inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-transparent px-2 text-xs font-medium text-muted-foreground outline-none",
          "transition-[background-color,color,transform] duration-150 ease-out",
          "hover:bg-accent/50 hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          "active:scale-[0.97]",
          "disabled:pointer-events-none disabled:opacity-50",
          active && "text-foreground",
          className,
        )}
        {...props}
      >
        {icon}
        <span className="truncate">{children}</span>
      </button>
    );
  },
);
