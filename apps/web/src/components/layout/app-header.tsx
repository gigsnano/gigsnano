import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";

/**
 * The secondary header. Mounted at the top of a route's content column, above
 * the scrollable ContentWrapper. Fixed height so switching routes never shifts
 * the content below it. Left: the global route-driven breadcrumb. Right: the
 * page's own actions.
 */
export function AppHeader({
  actions,
  className,
}: {
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // `@container/hdr` lets the breadcrumb + page actions respond to the
        // *content width* (which shrinks when the GigsAI pane opens), not the
        // viewport — viewport breakpoints can't see the squeeze.
        "@container/hdr flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 sm:px-6",
        // Phones (Plane's mobile header): breadcrumb on its own row, actions
        // on a second row below it.
        "max-md:h-auto max-md:min-h-14 max-md:flex-wrap max-md:gap-y-0 max-md:py-1.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center overflow-hidden max-lg:basis-auto max-md:h-10 max-md:basis-full">
        <Breadcrumbs />
      </div>
      {/* Below lg the actions scroll sideways instead of spilling out of the
          card when they are wider than the content column. The padding keeps
          focus rings inside the scroll box. On phones they get the full second
          row and keep their natural width (no label wrapping). */}
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5 max-lg:-mx-1 max-lg:min-w-0 max-lg:shrink max-lg:overflow-x-auto max-lg:px-1 max-lg:py-1 max-lg:[scrollbar-width:none] max-md:basis-full max-md:*:shrink-0 max-md:*:whitespace-nowrap">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
