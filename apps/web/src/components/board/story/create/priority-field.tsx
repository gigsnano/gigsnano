"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { STORY_PRIORITY_META, STORY_PRIORITY_ORDER } from "@/constants/story-meta";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { EStoryPriority } from "@/types";

export function PriorityField({ value, onChange }: { value: EStoryPriority; onChange: (v: EStoryPriority) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill icon={<PriorityGlyph priority={value} className="size-3.5" />} active>
          {STORY_PRIORITY_META[value].label}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STORY_PRIORITY_ORDER.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onChange(p)}>
            <PriorityGlyph priority={p} />
            <span className="flex-1">{STORY_PRIORITY_META[p].label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
