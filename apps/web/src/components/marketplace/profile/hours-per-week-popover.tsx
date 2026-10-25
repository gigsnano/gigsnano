"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HOURS_PER_WEEK_OPTIONS } from "@/constants/marketplace";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

/**
 * Single-select popover for the sidebar "Hours per week" entry. Wraps a
 * controlled trigger (an `EditIconButton`, forwarded via `asChild`).
 */
export function HoursPerWeekPopover({ children }: { children: ReactNode }) {
  const hours = useMarketplaceProfileStore((s) => s.hours_per_week);
  const updateProfile = useMarketplaceProfileStore((s) => s.updateProfile);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 origin-[var(--radix-popover-content-transform-origin)] p-1"
      >
        {HOURS_PER_WEEK_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => updateProfile({ hours_per_week: opt })}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.98]"
          >
            {opt}
            {hours === opt && (
              <HugeiconsIcon
                icon={Tick02Icon}
                className="size-4 shrink-0 animate-in fade-in zoom-in-50 text-primary duration-150"
              />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
