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
import { useCreateView } from "@/hooks/project/use-views";
import { cn } from "@/lib/utils";
import { filtersToGigsql } from "@/lib/views/gigsql-codec";
import { VIEW_FILTER_FIELDS } from "@/lib/views/filter-query";
import { canonicalGigsqlView, gigsqlViewError } from "@/lib/views/validate-gigsql";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { EViewLayout, EViewShareScope } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateViewDialog({
  workspaceSlug,
  projectId,
  open,
  onOpenChange,
  children,
}: {
  workspaceSlug: string;
  projectId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [layout, setLayout] = useState<EViewLayout>(EViewLayout.Board);
  const [shareScope, setShareScope] = useState<EViewShareScope>(EViewShareScope.Private);
  const [filterQuery, setFilterQuery] = useState("");
  const storeFilters = useIssuesViewStore((s) => s.filters);
  const create = useCreateView(workspaceSlug, projectId);

  // Validated with the real GigsQL grammar (GIN-311) — the same one the toolbar
  // and backend use, so `status in (todo, in_progress)` is accepted here too.
  const filterError = gigsqlViewError(filterQuery);

  // Prefill GigsQL from the active toolbar filters the moment the dialog opens
  // (GIN-171). Adjusting state during render on the open transition avoids a
  // setState-in-effect cascade the React Compiler can't optimize.
  const [wasOpen, setWasOpen] = useState(actualOpen);
  if (actualOpen !== wasOpen) {
    setWasOpen(actualOpen);
    if (actualOpen) setFilterQuery(filtersToGigsql(storeFilters));
  }

  const reset = () => {
    setName("");
    setDescription("");
    setLayout(EViewLayout.Board);
    setShareScope(EViewShareScope.Private);
    setFilterQuery("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || filterError) return;
    await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      layout,
      filter_query: canonicalGigsqlView(filterQuery),
      share_scope: shareScope,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={actualOpen}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {isControlled ? null : (
        <DialogTrigger asChild>
          {children ?? (
            <Button size="sm" className="transition-transform duration-150 ease-out active:scale-[0.97]">
              New view
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogTitle>Create saved view</DialogTitle>
        <DialogDescription>
          Filter work with GigsQL — space-separated <code className="text-xs">field:value</code> terms
          ANDed together. Match several values with{" "}
          <code className="text-xs">status in (todo, in_progress)</code>. E.g.{" "}
          <code className="text-xs">status:in_progress</code>,{" "}
          <code className="text-xs">status:todo priority:high</code>, or{" "}
          <code className="text-xs">assignee:me</code>. Leave it empty to show everything.
        </DialogDescription>
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
              aria-describedby="view-filter-help"
              className={field + " font-mono text-xs"}
            />
            <span
              id="view-filter-help"
              className={cn("text-xs font-normal", filterError ? "text-destructive" : "text-muted-foreground")}
            >
              {filterError ??
                `Space-separated "field:value" terms. Fields: ${VIEW_FILTER_FIELDS.join(", ")}.`}
            </span>
          </label>
          <Button type="submit" disabled={create.isPending || Boolean(filterError)} className="mt-1">
            {create.isPending ? "Creating…" : "Create view"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
