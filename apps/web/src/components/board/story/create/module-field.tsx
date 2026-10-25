"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { useModules } from "@/hooks/project/use-modules";

export function ModuleField({ workspaceSlug, projectId, value, onChange }: {
  workspaceSlug: string; projectId: string; value: string | null; onChange: (v: string | null) => void;
}) {
  const { data: modules } = useModules(workspaceSlug, projectId);
  const items = modules ?? [];
  const current = items.find((m) => m.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={!!current}
          icon={<HugeiconsIcon icon={Layers01Icon} className="size-3.5" />}
        >
          {current ? current.name : "Module"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1 text-muted-foreground">No module</span>
        </DropdownMenuItem>
        {items.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)}>
            <span className="flex-1 truncate">{m.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
