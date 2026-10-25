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
import { useUpdateView } from "@/hooks/project/use-views";
import { cn } from "@/lib/utils";
import { VIEW_FILTER_FIELDS } from "@/lib/views/filter-query";
import { canonicalGigsqlView, gigsqlViewError } from "@/lib/views/validate-gigsql";
import { EViewLayout, EViewShareScope, type IProjectView } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function EditViewDialog({
  view,
  workspaceSlug,
  projectId,
}: {
  view: IProjectView;
  workspaceSlug: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description);
  const [layout, setLayout] = useState(view.layout);
  const [shareScope, setShareScope] = useState(view.share_scope);
  const [filterQuery, setFilterQuery] = useState(view.filter_query);
  const update = useUpdateView(workspaceSlug, projectId);

  // An existing view may already hold an unsupported query — surface it here so
  // editing is how it gets fixed, rather than saving it again unchanged (GIN-175).
  // Validated with the real GigsQL grammar (GIN-311).
  const filterError = gigsqlViewError(filterQuery);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || filterError) return;
    await update.mutateAsync({
      viewId: view.id,
      payload: {
        name: name.trim(),
        description: description.trim(),
        layout,
        filter_query: canonicalGigsqlView(filterQuery),
        share_scope: shareScope,
      },
    });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setName(view.name);
          setDescription(view.description);
          setLayout(view.layout);
          setShareScope(view.share_scope);
          setFilterQuery(view.filter_query);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit view</DialogTitle>
        <DialogDescription>Update the name, layout, or filter for this saved view.</DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Layout
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as EViewLayout)}
              className={field}
            >
              <option value={EViewLayout.Board}>Board</option>
              <option value={EViewLayout.List}>List</option>
              <option value={EViewLayout.Table}>Table</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Sharing
            <select
              value={shareScope}
              onChange={(e) => setShareScope(e.target.value as EViewShareScope)}
              className={field}
            >
              <option value={EViewShareScope.Private}>Private — only you</option>
              <option value={EViewShareScope.Project}>Project — all members</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            GigsQL
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="status:in_progress"
              aria-invalid={Boolean(filterError)}
              aria-describedby="edit-view-filter-help"
              className={field + " font-mono text-xs"}
            />
            <span
              id="edit-view-filter-help"
              className={cn("text-xs font-normal", filterError ? "text-destructive" : "text-muted-foreground")}
            >
              {filterError ??
                `"field:value" terms, or status in (todo, in_progress). Fields: ${VIEW_FILTER_FIELDS.join(", ")}.`}
            </span>
          </label>
          <Button type="submit" disabled={update.isPending || Boolean(filterError)}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
