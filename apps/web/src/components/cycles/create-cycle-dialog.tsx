"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateCycle, useUpdateCycle } from "@/hooks/project/use-cycles";
import type { ICycle } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateCycleDialog({
  workspaceSlug,
  projectId,
  cycle,
  open: openProp,
  onOpenChange,
  children,
}: {
  workspaceSlug: string;
  projectId: string;
  cycle?: ICycle;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const isEdit = Boolean(cycle);
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  // Route open-state changes to the parent (controlled) or to local state.
  // Pass the setter by reference rather than wrapping, so this isn't mistaken
  // for an impure setState updater.
  const handleOpenChange = controlled ? (onOpenChange ?? (() => {})) : setOpenState;

  const [name, setName] = useState(cycle?.name ?? "");
  const [description, setDescription] = useState(cycle?.description ?? "");
  const [startDate, setStartDate] = useState(cycle?.start_date ?? "");
  const [endDate, setEndDate] = useState(cycle?.end_date ?? "");

  // Re-seed the form when the dialog transitions closed → open, using a
  // render-phase prev-prop compare (React's sanctioned alternative to a
  // setState-in-effect; see CLAUDE.md react rules).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(cycle?.name ?? "");
      setDescription(cycle?.description ?? "");
      setStartDate(cycle?.start_date ?? "");
      setEndDate(cycle?.end_date ?? "");
    }
  }

  const create = useCreateCycle(workspaceSlug, projectId);
  const update = useUpdateCycle(workspaceSlug, projectId, cycle?.id ?? "");
  const pending = create.isPending || update.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      description: description.trim(),
      start_date: startDate || null,
      end_date: endDate || null,
    };
    if (isEdit) {
      await update.mutateAsync(payload);
      handleOpenChange(false);
      return;
    }
    const created = await create.mutateAsync(payload);
    handleOpenChange(false);
    router.push(`/${workspaceSlug}/projects/${projectId}/cycles/${created.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlled ? null : (
        <DialogTrigger asChild>
          {children ?? (
            <Button type="button" size="sm">
              Add cycle
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogTitle>{isEdit ? "Edit cycle" : "New cycle"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Update this cycle's details." : "Time-box work into a delivery cycle."}
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cycle 2"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={field + " min-h-[4rem] py-2"}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              End date
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <Button type="submit" disabled={pending}>
            {pending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create cycle"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
