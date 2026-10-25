"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUpdateModule } from "@/hooks/project/use-modules";
import { EModuleStatus, type IModule } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function EditModuleDialog({
  module,
  workspaceSlug,
  projectId,
}: {
  module: IModule;
  workspaceSlug: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(module.name);
  const [description, setDescription] = useState(module.description);
  const [status, setStatus] = useState(module.status);
  const update = useUpdateModule(workspaceSlug, projectId, module.id);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await update.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      status,
    });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setName(module.name);
          setDescription(module.description);
          setStatus(module.status);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Edit module
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit module</DialogTitle>
        <DialogDescription>Update module name, description, or status.</DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
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
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EModuleStatus)}
              className={field}
            >
              <option value={EModuleStatus.Backlog}>Backlog</option>
              <option value={EModuleStatus.Planned}>Planned</option>
              <option value={EModuleStatus.InProgress}>In progress</option>
              <option value={EModuleStatus.Completed}>Completed</option>
            </select>
          </label>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
