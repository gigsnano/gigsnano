"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateStoryLink } from "@/hooks/story/use-story-detail";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateLinkDialog({
  workspaceSlug,
  projectId,
  storyId,
  open,
  onOpenChange,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const create = useCreateStoryLink(workspaceSlug, projectId, storyId);

  const reset = () => {
    setTitle("");
    setUrl("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    await create.mutateAsync({ title: title.trim(), url: url.trim() });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>Add link</DialogTitle>
        <DialogDescription>Paste an external URL related to this work item.</DialogDescription>
        <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design doc, Figma, spec…"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            URL
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className={field}
            />
          </label>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
