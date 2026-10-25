"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  EXTENDED_PROJECT_SIDEBAR_WIDTH,
  useProjectsFlyoutStore,
} from "@/store/ui/projects-flyout.store";
import { usePanelStore } from "@/store/ui/panel.store";
import { useExtendedSidebarOutsideClick } from "@/hooks/use-extended-sidebar-outside-click";

/** Absolute flyout docked to the right edge of Rail B (Plane `ExtendedSidebarWrapper`). */
export function ExtendedSidebarWrapper({
  children,
  excludedElementId,
  className,
}: {
  children: ReactNode;
  excludedElementId?: string;
  className?: string;
}) {
  const open = useProjectsFlyoutStore((s) => s.open);
  const setOpen = useProjectsFlyoutStore((s) => s.setOpen);
  const collapsed = usePanelStore((s) => s.collapsed);
  const ref = useRef<HTMLDivElement>(null);

  useExtendedSidebarOutsideClick(ref, open, () => setOpen(false), excludedElementId);

  useEffect(() => {
    if (collapsed) setOpen(false);
  }, [collapsed, setOpen]);

  if (!open || collapsed) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-0 z-[21] flex h-full flex-col border-r bg-background shadow-md",
        "animate-in fade-in slide-in-from-left-2 duration-300 ease-out motion-reduce:animate-none",
        className,
      )}
      style={{
        left: "var(--panel-w, 260px)",
        width: EXTENDED_PROJECT_SIDEBAR_WIDTH,
      }}
      aria-hidden={false}
    >
      {children}
    </div>
  );
}
