"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export interface IDashboardFormValues {
  name: string;
  description: string;
}

/**
 * Inner form. Mounted fresh each time the dialog opens (the dialog content
 * unmounts on close), so `useState` initializers seed from `initial` without an
 * effect — no synchronous setState-in-effect, which the React Compiler can't
 * optimize.
 */
function DashboardForm({
  mode,
  initial,
  onSubmit,
  onDone,
}: {
  mode: "create" | "rename";
  initial?: IDashboardFormValues;
  onSubmit: (values: IDashboardFormValues) => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pending, setPending] = useState(false);
  const isCreate = mode === "create";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    // Promise chain (not try/finally — the compiler can't lower a catch-less
    // try). On success the dialog closes and this form unmounts; on failure we
    // re-enable the button so the user can retry.
    onSubmit({ name: name.trim(), description: description.trim() })
      .then(onDone)
      .catch(() => setPending(false));
  };

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label id="dashboard-name-label" htmlFor="dashboard-name">
          Name
        </Label>
        <input
          id="dashboard-name"
          aria-labelledby="dashboard-name-label"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My work"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label id="dashboard-description-label" htmlFor="dashboard-description">
          Description (optional)
        </Label>
        <input
          id="dashboard-description"
          aria-labelledby="dashboard-description-label"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this dashboard is for"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending
          ? isCreate
            ? "Creating…"
            : "Saving…"
          : isCreate
            ? "Create dashboard"
            : "Save changes"}
      </Button>
    </form>
  );
}

/** Shared create/rename dialog. `initial` seeds the fields (rename); omit for create. */
export function DashboardFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  initial?: IDashboardFormValues;
  onSubmit: (values: IDashboardFormValues) => Promise<void>;
}) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{isCreate ? "Create dashboard" : "Rename dashboard"}</DialogTitle>
        <DialogDescription>
          {isCreate
            ? "A personal dashboard to arrange widgets the way you work."
            : "Update this dashboard's name and description."}
        </DialogDescription>
        {open ? (
          <DashboardForm
            mode={mode}
            initial={initial}
            onSubmit={onSubmit}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
