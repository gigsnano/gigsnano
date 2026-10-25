"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Timer01Icon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { DURATION_PRESETS_MIN, formatDuration } from "@/lib/issues/estimate-values";

/** Create-modal time-duration field (GIN-331). Shown only in the "time" method. */
export function DurationField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={value != null}
          icon={<HugeiconsIcon icon={Timer01Icon} className="size-3.5" />}
        >
          {value != null ? formatDuration(value) : "Duration"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-40 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1 text-muted-foreground">No duration</span>
        </DropdownMenuItem>
        {DURATION_PRESETS_MIN.map((min) => (
          <DropdownMenuItem key={min} onSelect={() => onChange(min)}>
            <span className="flex-1 truncate font-mono text-xs">{formatDuration(min)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
