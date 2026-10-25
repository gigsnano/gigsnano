"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { JOURNEY_ENABLED } from "@/lib/journey/journey-flag";
import { activeOverviewTab, overviewTabs } from "@/lib/nav/overview-tabs";
import { cn } from "@/lib/utils";

/**
 * Overview · Journey · Views — sliding pill, same treatment as the Work Items
 * view switcher. Renders nothing off the three tab roots, so the header can
 * mount it unconditionally.
 */
export function OverviewTabs({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/projects/${projectId}`;
  const tabs = overviewTabs(base, JOURNEY_ENABLED);
  const active = activeOverviewTab(pathname, base);
  // -1 off a tab root, so returning to a root always re-runs the pill effect.
  const activeIndex = tabs.findIndex((t) => t.id === active);
  const { barRef, pillRef } = useSlidingTabs(activeIndex);

  if (!active) return null;

  return (
    <nav
      ref={barRef}
      aria-label="Overview sections"
      className="relative flex items-center rounded-lg border bg-muted/40 p-0.5"
    >
      <span
        ref={pillRef}
        className="t-issues-pill pointer-events-none absolute inset-y-0.5 left-0 rounded-md bg-background shadow-sm"
        aria-hidden
      />
      {tabs.map((tab, i) => (
        <Link
          key={tab.id}
          href={tab.href}
          data-tab-index={i}
          aria-current={tab.id === active ? "page" : undefined}
          className={cn(
            "relative z-[1] rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50",
            tab.id === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
