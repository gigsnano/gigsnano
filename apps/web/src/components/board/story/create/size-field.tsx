"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { RulerIcon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { ESize } from "@/types";

const SIZES = [ESize.XS, ESize.S, ESize.M, ESize.L, ESize.XL];

/** Create-modal simple-size field (GIN-331). Shown only in the "simple" method. */
export function SizeField({
  value,
  onChange,
}: {
  value: ESize | null;
  onChange: (size: ESize | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={!!value}
          icon={<HugeiconsIcon icon={RulerIcon} className="size-3.5" />}
        >
          {value ? value.toUpperCase() : "Size"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1 text-muted-foreground">No size</span>
        </DropdownMenuItem>
        {SIZES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
            <span className="flex-1 truncate font-mono text-xs">{s.toUpperCase()}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
