"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { projectRouteManagesOwnScroll } from "@/lib/projects/project-scroll-routes";

/** Scroll region under ProjectHeader — detail pages manage their own inner scroll. */
export function ProjectScrollRegion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const managesOwnScroll = projectRouteManagesOwnScroll(pathname);

  return (
    <div
      className={cn(
        "min-h-0 flex-1",
        managesOwnScroll ? "flex flex-col overflow-hidden" : "overflow-y-auto",
      )}
    >
      {children}
    </div>
  );
}
