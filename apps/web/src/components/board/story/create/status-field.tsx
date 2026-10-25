"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { STORY_STATUS_META, STORY_STATUS_ORDER } from "@/constants/story-meta";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { EStoryStatus } from "@/types";

export function StatusField({ value, onChange }: { value: EStoryStatus; onChange: (v: EStoryStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill icon={<StatusIcon status={value} className="size-3.5" />} active>
          {STORY_STATUS_META[value].label}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STORY_STATUS_ORDER.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
            <StatusIcon status={s} />
            <span className="flex-1">{STORY_STATUS_META[s].label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
