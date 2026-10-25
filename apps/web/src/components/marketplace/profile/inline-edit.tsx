"use client";

import * as React from "react";
import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, PencilEdit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const field =
  "w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Pencil icon button used across the profile page (circled pencil).
 * Spreads `...props` and forwards `ref` so it can be used as a Radix
 * `asChild` trigger (e.g. `<PopoverTrigger asChild><EditIconButton .../></PopoverTrigger>`),
 * which clones the child and injects `onClick`/`aria-expanded`/`ref`.
 */
export function EditIconButton({
  label,
  icon = PencilEdit02Icon,
  className,
  ...props
}: {
  label: string;
  icon?: typeof PencilEdit02Icon;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border text-primary transition-[color,border-color,background-color,transform] duration-150 ease-out hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-90",
        className,
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  );
}

/**
 * Display value + pencil; clicking swaps to an inline input with save/cancel.
 * `multiline` renders a textarea (overview-style sections).
 */
export function InlineEdit({
  value,
  placeholder,
  onSave,
  label,
  multiline = false,
  type = "text",
  display,
}: {
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  label: string;
  multiline?: boolean;
  type?: "text" | "number";
  /** Custom renderer for the display state; defaults to the raw value. */
  display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className={cn("min-w-0", !value && "text-muted-foreground")}>
          {display ?? (value || placeholder)}
        </div>
        <EditIconButton label={`Edit ${label}`} onClick={start} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {multiline ? (
        <textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className={cn(field, "resize-y leading-relaxed")}
        />
      ) : (
        <input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={placeholder}
          aria-label={label}
          className={field}
        />
      )}
      <div className="flex items-center gap-1.5 self-end">
        <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(false)}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
        <Button size="icon-sm" aria-label={`Save ${label}`} onClick={save}>
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
        </Button>
      </div>
    </div>
  );
}
