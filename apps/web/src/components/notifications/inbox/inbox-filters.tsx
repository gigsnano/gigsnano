"use client";

import { INBOX_TABS } from "@/lib/notifications/inbox-filters";
import { cn } from "@/lib/utils";
import type { ENotificationCategory } from "@/types";

/**
 * Primary Inbox filters as a compact, horizontally-scrollable pill strip — fits
 * the narrow master-detail list pane without clipping (GIN-270). Active pill is
 * signalled by weight + fill, not color alone.
 */
export function InboxFilters({
  value,
  onChange,
}: {
  value: ENotificationCategory;
  onChange: (v: ENotificationCategory) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter notifications"
      className="flex items-center gap-1 overflow-x-auto px-3 py-2"
    >
      {INBOX_TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 active:scale-[0.98]",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
