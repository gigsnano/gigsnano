"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { useProjectStoriesPage, useStory } from "@/hooks/story/use-stories";

export function ParentField({ workspaceSlug, projectId, value, onChange, selfId }: {
  workspaceSlug: string;
  projectId: string;
  value: string | null;
  onChange: (v: string | null) => void;
  selfId?: string;
}) {
  const { data: page } = useProjectStoriesPage(workspaceSlug, projectId, {
    product_only: true,
    limit: 50,
    offset: 0,
  });
  const { data: currentFromApi } = useStory(workspaceSlug, projectId, value ?? "");
  const items = (page?.items ?? []).filter((s) => s.id !== selfId);
  const current = value
    ? (items.find((s) => s.id === value) ?? currentFromApi)
    : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={!!current}
          icon={<HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />}
        >
          {current ? current.title : "Add parent"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1 text-muted-foreground">No parent</span>
        </DropdownMenuItem>
        {items.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onChange(s.id)}>
            <span className="flex-1 truncate">{s.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
