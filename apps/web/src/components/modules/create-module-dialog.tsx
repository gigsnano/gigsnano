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
import { useCreateModule } from "@/hooks/project/use-modules";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateModuleDialog({
  workspaceSlug,
  projectId,
  children,
}: {
  workspaceSlug: string;
  projectId: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateModule(workspaceSlug, projectId);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const mod = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
    });
    setOpen(false);
    setName("");
    setDescription("");
    router.push(`/${workspaceSlug}/projects/${projectId}/modules/${mod.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" size="sm">
            New module
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>New module</DialogTitle>
        <DialogDescription>Group related stories into a feature or initiative.</DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Authentication"
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
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create module"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
