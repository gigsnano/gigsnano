"use client";

import type { EPlatformUserStatus, IPlatformUserFilters } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: EPlatformUserStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export function UsersToolbar({
  filters,
  onFiltersChange,
}: {
  filters: IPlatformUserFilters;
  onFiltersChange: (filters: IPlatformUserFilters) => void;
}) {
  const status = filters.status ?? "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder="Search name or email…"
        aria-label="Search users"
        className="w-56 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        value={filters.q ?? ""}
        onChange={(e) =>
          onFiltersChange({ ...filters, q: e.target.value || undefined })
        }
      />
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onFiltersChange({ ...filters, status: opt.value })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
              status === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
