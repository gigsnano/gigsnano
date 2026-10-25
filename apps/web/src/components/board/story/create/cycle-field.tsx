"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { useCycles } from "@/hooks/project/use-cycles";

export function CycleField({ workspaceSlug, projectId, value, onChange }: {
  workspaceSlug: string; projectId: string; value: string | null; onChange: (v: string | null) => void;
}) {
  const { data: cycles } = useCycles(workspaceSlug, projectId);
  const items = cycles ?? [];
  const current = items.find((c) => c.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={!!current}
          icon={<HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />}
        >
          {current ? current.name : "Cycle"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1 text-muted-foreground">No cycle</span>
        </DropdownMenuItem>
        {items.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => onChange(c.id)}>
            <span className="flex-1 truncate">{c.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
