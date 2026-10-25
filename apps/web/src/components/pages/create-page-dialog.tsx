"use client";

import { useState } from "react";

import { useCreatePage } from "@/hooks/docs/use-pages";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * New-page dialog. Uncontrolled by default (renders its own "New page" trigger,
 * or a custom `children` trigger); pass `open`/`onOpenChange` to drive it
 * externally (e.g. from an EmptyState CTA).
 */
export function CreatePageDialog({
  workspaceSlug,
  projectId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
}: {
  workspaceSlug: string;
  projectId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const create = useCreatePage(workspaceSlug, projectId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const onOpenChange = isControlled ? controlledOnOpenChange! : setUncontrolledOpen;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await create.mutateAsync({ title: title.trim(), content: content.trim() });
    setTitle("");
    setContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {isControlled ? null : (
        <DialogTrigger asChild>
          {children ?? (
            <Button size="sm" className="active:scale-[0.97]">
              New page
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogTitle>New page</DialogTitle>
        <DialogDescription>Add a wiki page to this project.</DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label id="page-title-label" htmlFor="page-title">Title</Label>
            <input
              id="page-title"
              aria-labelledby="page-title-label"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Page title"
              className={field}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label id="page-content-label" htmlFor="page-content">Content</Label>
            <textarea
              id="page-content"
              aria-labelledby="page-content-label"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Markdown content (optional)"
              rows={6}
              className={`${field} min-h-24 resize-y py-2`}
            />
          </div>
          <Button type="submit" disabled={create.isPending} className="active:scale-[0.97]">
            {create.isPending ? "Creating…" : "Create page"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
