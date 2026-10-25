"use client";

import { useState, type CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import {
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useUpdateCustomField,
} from "@/hooks/project/use-project-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ECustomFieldType, type ICustomFieldDefinition } from "@/types";
import {
  addOption,
  fromOptionValues,
  moveOption,
  removeOption,
  toOptionValues,
  type IOptionDraft,
} from "@/lib/custom-fields/options-editor";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Reorder / remove chip affordances — small hit target bumped to a full 6-unit
 * tap area with a quiet hover fill, matching the borderless-icon-button feel
 * used by `propertyTrigger` elsewhere in the app. */
const chipIconButton =
  "flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30";

const TYPE_LABEL: Record<ECustomFieldType, string> = {
  [ECustomFieldType.Text]: "Text",
  [ECustomFieldType.Number]: "Number",
  [ECustomFieldType.Date]: "Date",
  [ECustomFieldType.Select]: "Single-select",
};

function optionsPreview(options: string[] | null): string | null {
  if (!options || options.length === 0) return null;
  const shown = options.slice(0, 2).join(", ");
  const rest = options.length - 2;
  return rest > 0 ? `${shown}, +${rest}` : shown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function CustomFieldsSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useCustomFields(workspaceSlug, projectId);
  const create = useCreateCustomField(workspaceSlug, projectId);
  const update = useUpdateCustomField(workspaceSlug, projectId);
  const remove = useDeleteCustomField(workspaceSlug, projectId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<ECustomFieldType>(ECustomFieldType.Text);
  const [options, setOptions] = useState<IOptionDraft[]>([]);
  const [optionDraft, setOptionDraft] = useState("");

  const isSelect = fieldType === ECustomFieldType.Select;
  const canSubmit = name.trim().length > 0 && (!isSelect || options.length > 0);
  const mutation = editingId ? update : create;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setFieldType(ECustomFieldType.Text);
    setOptions([]);
    setOptionDraft("");
  };

  const onEdit = (f: ICustomFieldDefinition) => {
    setEditingId(f.id);
    setName(f.name);
    setFieldType(f.field_type);
    setOptions(fromOptionValues(f.options ?? []));
    setOptionDraft("");
  };

  const onAddOption = () => {
    if (!optionDraft.trim()) return;
    setOptions((prev) => addOption(prev, { id: crypto.randomUUID(), value: optionDraft }));
    setOptionDraft("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const trimmedName = name.trim();
    const payloadOptions = isSelect ? toOptionValues(options) : null;

    if (editingId) {
      await update.mutateAsync({
        customFieldId: editingId,
        payload: { name: trimmedName, options: payloadOptions },
      });
    } else {
      await create.mutateAsync({
        name: trimmedName,
        field_type: fieldType,
        options: payloadOptions,
      });
    }
    resetForm();
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-24" />
        </div>
        <ul className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-16" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load custom fields"
        description="Something went wrong."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const fields = [...(data ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">
          {editingId ? "Edit custom field" : "Add custom field"}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label id="cf-name-label" htmlFor="cf-name">
            Name
          </Label>
          <input
            id="cf-name"
            aria-labelledby="cf-name-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="cf-type-label" htmlFor="cf-type">
            Type
          </Label>
          <select
            id="cf-type"
            aria-labelledby="cf-type-label"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as ECustomFieldType)}
            disabled={Boolean(editingId)}
            className={cn(field, "disabled:cursor-not-allowed disabled:opacity-60")}
          >
            <option value={ECustomFieldType.Text}>Text</option>
            <option value={ECustomFieldType.Number}>Number</option>
            <option value={ECustomFieldType.Date}>Date</option>
            <option value={ECustomFieldType.Select}>Single-select</option>
          </select>
        </div>

        {isSelect && (
          <div className="flex flex-col gap-1.5">
            <Label id="cf-options-label" htmlFor="cf-option-draft">
              Options
            </Label>
            <div className="flex gap-2">
              <input
                id="cf-option-draft"
                aria-labelledby="cf-options-label"
                value={optionDraft}
                onChange={(e) => setOptionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddOption();
                  }
                }}
                placeholder="Add an option"
                className={field}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAddOption}
                disabled={!optionDraft.trim()}
              >
                Add
              </Button>
            </div>
            {options.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {options.map((opt, i) => (
                  <li
                    key={opt.id}
                    style={{ "--i": i } as CSSProperties}
                    className="t-avatar-reveal flex items-center gap-1 rounded-full border bg-muted py-1 pr-1 pl-2.5 text-xs transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => moveOption(prev, opt.id, "up"))}
                      disabled={i === 0}
                      aria-label={`Move ${opt.value} earlier`}
                      className={chipIconButton}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => moveOption(prev, opt.id, "down"))}
                      disabled={i === options.length - 1}
                      aria-label={`Move ${opt.value} later`}
                      className={chipIconButton}
                    >
                      ↓
                    </button>
                    <span className="px-0.5">{opt.value}</span>
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => removeOption(prev, opt.id))}
                      aria-label={`Remove ${opt.value}`}
                      className={cn(chipIconButton, "hover:text-destructive")}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mutation.isError && <p className="text-xs text-destructive">{errorMessage(mutation.error)}</p>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending
              ? editingId
                ? "Saving…"
                : "Adding…"
              : editingId
                ? "Save changes"
                : "Add field"}
          </Button>
          {editingId && (
            <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {fields.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No custom fields yet"
          description="Custom fields let your team track extra structured data on stories."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {fields.map((f) => {
            const preview = optionsPreview(f.options);
            return (
              <li
                key={f.id}
                className="t-doc-row flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/30"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {TYPE_LABEL[f.field_type]}
                    </span>
                  </div>
                  {preview && <p className="text-xs text-muted-foreground">{preview}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(f)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(f.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
