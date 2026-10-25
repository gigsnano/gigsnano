"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { useProjectLabels } from "@/hooks/project/use-project-settings";
import { cn } from "@/lib/utils";

/** Multi-select labels on the create form (GIN-475). The menu stays open while
 *  picking, so assigning three labels is three clicks, not three reopenings. */
export function LabelField({ workspaceSlug, projectId, value, onChange }: {
  workspaceSlug: string; projectId: string; value: string[]; onChange: (v: string[]) => void;
}) {
  const { data: labels } = useProjectLabels(workspaceSlug, projectId);
  const selected = new Set(value);
  const chosen = (labels ?? []).filter((l) => selected.has(l.id));
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={chosen.length > 0}
          icon={chosen.length === 1
            ? <span className="size-2.5 rounded-full" style={{ backgroundColor: chosen[0]!.color }} />
            : <HugeiconsIcon icon={Tag01Icon} className="size-3.5" />}
        >
          {chosen.length === 0 ? "Labels" : chosen.length === 1 ? chosen[0]!.name : `${chosen.length} labels`}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {(labels ?? []).length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Add labels in project settings first.
          </div>
        ) : null}
        {(labels ?? []).map((l) => (
          <DropdownMenuItem
            key={l.id}
            onSelect={(e) => {
              e.preventDefault(); // keep the menu open for the next pick
              toggle(l.id);
            }}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border",
                selected.has(l.id) ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {selected.has(l.id) ? <HugeiconsIcon icon={Tick02Icon} className="size-3" /> : null}
            </span>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="flex-1 truncate">{l.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
