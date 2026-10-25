"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PropertyPill } from "@/components/issues/shared/property-pill";

export function DraftDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const display = value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
    : label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <PropertyPill icon={<HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />} active={!!value}>
          {display}
        </PropertyPill>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 rounded-md border bg-background px-2 text-sm outline-none"
          aria-label={label}
        />
      </PopoverContent>
    </Popover>
  );
}
