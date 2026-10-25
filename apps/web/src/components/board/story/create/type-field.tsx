"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { STORY_TYPE_META, STORY_TYPE_ORDER } from "@/constants/story-meta";
import { TypeGlyph } from "@/components/issues/shared/type-glyph";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { EStoryType } from "@/types";

export function TypeField({
  value,
  onChange,
  allowedTypes,
  "aria-label": ariaLabel,
}: {
  value: EStoryType;
  onChange: (v: EStoryType) => void;
  /** Restrict the picker to these types (e.g. hierarchy-valid child types, GIN-317). */
  allowedTypes?: EStoryType[];
  /** Override the trigger's accessible name (default: the visible type label,
   * e.g. "Bug") — needed wherever several of these sit in a list and each one
   * needs to name what it belongs to. */
  "aria-label"?: string;
}) {
  const types =
    allowedTypes && allowedTypes.length
      ? STORY_TYPE_ORDER.filter((t) => allowedTypes.includes(t))
      : STORY_TYPE_ORDER;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          icon={<TypeGlyph type={value} className="size-3.5" />}
          active
          aria-label={ariaLabel ? `${ariaLabel}: ${STORY_TYPE_META[value].label}` : undefined}
        >
          {STORY_TYPE_META[value].label}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {types.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => onChange(t)}>
            <TypeGlyph type={t} />
            <span className="flex-1">{STORY_TYPE_META[t].label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
