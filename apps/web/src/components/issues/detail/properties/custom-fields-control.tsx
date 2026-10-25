"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckListIcon } from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IssuePropertyListItem } from "@/components/issues/detail/shared/property-list-item";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import { useCustomFields } from "@/hooks/project/use-project-settings";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import { cn } from "@/lib/utils";
import { ECustomFieldType, type ICustomFieldDefinition, type IStory } from "@/types";

type CustomFieldValue = string | number | null;

const CUSTOM_FIELD_DEBOUNCE_MS = 500;

const textInputClass =
  "h-7 w-full max-w-full rounded-md border-none bg-transparent px-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40";

function toDraft(value: CustomFieldValue): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Text/number editors: local draft state, debounced commit (~500ms). */
function TextOrNumberField({
  def,
  value,
  onChange,
}: {
  def: ICustomFieldDefinition;
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
}) {
  const [draft, setDraft] = useAdjustedState(toDraft(value));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mount-only cleanup — does not depend on the mutation object, so it can't
  // reintroduce the GIN-75 infinite-loop shape (effect deps must stay stable).
  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const isNumber = def.field_type === ECustomFieldType.Number;

  const handleChange = (raw: string) => {
    setDraft(raw);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(raw === "" ? null : isNumber ? Number(raw) : raw);
    }, CUSTOM_FIELD_DEBOUNCE_MS);
  };

  return (
    <input
      type={isNumber ? "number" : "text"}
      value={draft}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="—"
      aria-label={def.name}
      className={textInputClass}
    />
  );
}

/** Date editor — mirrors `date-field.tsx` (Popover + native date input, applied immediately). */
function DateField({
  def,
  value,
  onChange,
}: {
  def: ICustomFieldDefinition;
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
}) {
  const dateValue = typeof value === "string" ? value : "";
  const display = dateValue
    ? new Date(`${dateValue}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

  return (
    <Popover>
      <PopoverTrigger className={cn(propertyTrigger, dateValue && "text-foreground")}>
        {display}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <input
          type="date"
          value={dateValue}
          onChange={(e) => onChange(e.target.value || null)}
          className="rounded-md border bg-background px-2 py-1 text-sm outline-none"
          aria-label={def.name}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Select editor — dropdown of `definition.options`, applied immediately. */
function SelectField({
  def,
  value,
  onChange,
}: {
  def: ICustomFieldDefinition;
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
}) {
  const options = def.options ?? [];
  const current = typeof value === "string" ? value : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(propertyTrigger, current && "text-foreground")}>
          {current ?? "None"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>None</DropdownMenuItem>
        {options.map((opt) => (
          <DropdownMenuItem key={opt} onSelect={() => onChange(opt)}>
            {opt}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CustomFieldRow({
  def,
  value,
  onChange,
}: {
  def: ICustomFieldDefinition;
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
}) {
  let control: ReactNode;
  switch (def.field_type) {
    case ECustomFieldType.Date:
      control = <DateField def={def} value={value} onChange={onChange} />;
      break;
    case ECustomFieldType.Select:
      control = <SelectField def={def} value={value} onChange={onChange} />;
      break;
    default:
      control = <TextOrNumberField def={def} value={value} onChange={onChange} />;
  }

  return (
    <IssuePropertyListItem icon={CheckListIcon} label={def.name}>
      {control}
    </IssuePropertyListItem>
  );
}

/**
 * Editable custom-field values on the work-item detail (GIN-76 slice 2a).
 * One row per project custom-field definition, sorted by `sort_order`.
 * Renders nothing when the project has no custom fields defined.
 */
export function CustomFieldsControl({
  story,
  workspaceSlug,
  projectId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: definitions } = useCustomFields(workspaceSlug, projectId);
  const update = useUpdateStory(workspaceSlug, projectId);

  if (!definitions || definitions.length === 0) return null;

  const sorted = [...definitions].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      {sorted.map((def) => (
        <CustomFieldRow
          key={def.id}
          def={def}
          value={story.custom_fields?.[def.id] ?? null}
          onChange={(value) =>
            update.mutate({
              storyId: story.id,
              patch: { custom_fields: { ...story.custom_fields, [def.id]: value } },
            })
          }
        />
      ))}
    </>
  );
}
