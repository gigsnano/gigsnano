"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";

const TABS = [
  { label: "Overview", segment: "overview" },
  { label: "Velocity", segment: "velocity" },
  { label: "Active cycles", segment: "active-cycles" },
] as const;

export function AnalyticsTabNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/analytics`;

  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => pathname.startsWith(`${base}/${tab.segment}`)),
  );
  const { barRef, pillRef } = useSlidingTabs(activeIndex);

  return (
    <nav ref={barRef} className="relative flex gap-1 border-b px-6">
      <span
        ref={pillRef}
        className="t-project-tab-pill pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary"
        aria-hidden
      />
      {TABS.map((tab, i) => (
        <Link
          key={tab.segment}
          href={`${base}/${tab.segment}`}
          data-tab-index={i}
          className={cn(
            "relative z-[1] px-3 py-2.5 text-sm font-medium transition-colors duration-150",
            i === activeIndex ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
