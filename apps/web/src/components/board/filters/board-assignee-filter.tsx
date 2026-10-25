"use client";

import { cn } from "@/lib/utils";

export type EAssigneeFilter = "all" | "mine";

export function BoardAssigneeFilter({
  value,
  onChange,
  myCount,
}: {
  value: EAssigneeFilter;
  onChange: (value: EAssigneeFilter) => void;
  myCount: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
      {(
        [
          { id: "all" as const, label: "All stories" },
          { id: "mine" as const, label: `Assigned to me${myCount ? ` (${myCount})` : ""}` },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === opt.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
