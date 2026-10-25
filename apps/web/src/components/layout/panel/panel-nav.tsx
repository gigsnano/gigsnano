"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** A titled group of nav links. */
export function PanelSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {title ? (
        <div className="px-2.5 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * A collapsible group with a chevron header (Plane's "Workspace" / "Projects"
 * sections). Uncontrolled by default; `defaultOpen` seeds the initial state.
 */
export function PanelCollapsibleSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group/section flex items-center pr-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center justify-between gap-1 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-sidebar-foreground"
        >
          <span className="truncate">{title}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {action ? (
          <span className="opacity-0 transition-opacity group-hover/section:opacity-100">
            {action}
          </span>
        ) : null}
      </div>
      {open ? <div className="flex flex-col gap-0.5">{children}</div> : null}
    </div>
  );
}

/** A single nav link with icon + active state. */
export function PanelNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconSvgElement;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.9),inset_0_1px_1px_0_rgba(0,0,0,0.1)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.1),inset_0_1px_1px_0_rgba(0,0,0,0.3)]"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
