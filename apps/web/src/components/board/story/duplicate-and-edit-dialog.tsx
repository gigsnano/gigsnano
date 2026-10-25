"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { STORY_PRIORITY_META, STORY_PRIORITY_ORDER } from "@/constants/story-meta";
import { useClonePreview, useCloneStory } from "@/hooks/story/use-stories";
import { issueDetailHref, peekHref } from "@/lib/issues/issue-routes";
import type {
  ICloneCopyOptions,
  IClonePreview,
} from "@/services/story/story.service";
import { EStoryPriority, type IStory } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** GIN-356/358: "Duplicate and edit" — opens the editable creation flow prefilled
 * from a source item, with granular copy options, and creates an independent copy
 * via the clone endpoint. Distinct from "Make a copy" (immediate) and
 * "Mark as duplicate of…" (issue consolidation). */
export function DuplicateAndEditDialog({
  story,
  workspaceSlug,
  projectId,
  open,
  onOpenChange,
}: Props) {
  const { data: preview, isLoading } = useClonePreview(
    workspaceSlug,
    projectId,
    story.id,
    open,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate and edit</DialogTitle>
          <DialogDescription>
            {preview?.source_code ? (
              <>
                Creating from{" "}
                <Link
                  href={peekHref(story)}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {preview.source_code}
                </Link>
                . The source stays unchanged.
              </>
            ) : (
              "Create an independent copy you can edit before it's created."
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !preview ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <DuplicateForm
            key={preview.source_id}
            preview={preview}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} className="mt-0.5" />
      <span className="text-sm leading-tight">
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function DuplicateForm({
  preview,
  workspaceSlug,
  projectId,
  onDone,
}: {
  preview: IClonePreview;
  workspaceSlug: string;
  projectId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const clone = useCloneStory(workspaceSlug, projectId);

  // Hold only the *edits*; the effective value is computed inline from the prefill
  // until the user changes it. Avoids deriving prop → useState (which would go
  // stale if the prefill changed) while keeping the fields fully editable.
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const [priorityEdit, setPriorityEdit] = useState<EStoryPriority | null>(null);
  const title = titleEdit ?? preview.prefill.title;
  const priority = priorityEdit ?? preview.prefill.priority;
  // Copy toggles — defaults mirror the server policy: content/planning metadata on,
  // high-risk (children, relations) off.
  const [opts, setOpts] = useState<ICloneCopyOptions>({
    description: true,
    priority: true,
    labels: true,
    estimate: true,
    module: true,
    custom_fields: true,
    assignee: false,
    cycle: false,
    dates: false,
    date_mode: "exact",
    relations: false,
    include_children: false,
  });
  const [newStart, setNewStart] = useState("");

  const set = (patch: Partial<ICloneCopyOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const hasChildren = preview.child_count > 0;

  const submit = () => {
    const options: ICloneCopyOptions = {
      ...opts,
      new_start_date: opts.dates && opts.date_mode === "shift" ? newStart || null : null,
    };
    clone.mutate(
      {
        source_id: preview.source_id,
        options,
        overrides: { title: title.trim() || preview.prefill.title, priority },
      },
      {
        onSuccess: (result) => {
          onDone();
          router.push(
            issueDetailHref(workspaceSlug, {
              id: result.root_id,
              project_id: projectId,
              bmad: null,
            }),
          );
        },
      },
    );
  };

  const dateInvalid =
    opts.dates && opts.date_mode === "shift" && !newStart;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dup-title">Title</Label>
        <Input
          id="dup-title"
          value={title}
          onChange={(e) => setTitleEdit(e.target.value)}
          placeholder="Title of the new item"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Priority</Label>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm">
            <PriorityGlyph priority={priority} />
            <span className="flex-1 text-left">{STORY_PRIORITY_META[priority].label}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
            {STORY_PRIORITY_ORDER.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => setPriorityEdit(p)}>
                <PriorityGlyph priority={p} />
                <span className="flex-1">{STORY_PRIORITY_META[p].label}</span>
                {priority === p ? (
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">What to copy</legend>
        <div className="grid grid-cols-2 gap-x-4">
          <OptionRow label="Description" checked={!!opts.description} onChange={(v) => set({ description: v })} />
          <OptionRow label="Priority" checked={!!opts.priority} onChange={(v) => set({ priority: v })} />
          <OptionRow label="Labels" checked={!!opts.labels} onChange={(v) => set({ labels: v })} />
          <OptionRow label="Estimate" checked={!!opts.estimate} onChange={(v) => set({ estimate: v })} />
          <OptionRow label="Module" checked={!!opts.module} onChange={(v) => set({ module: v })} />
          <OptionRow label="Custom fields" checked={!!opts.custom_fields} onChange={(v) => set({ custom_fields: v })} />
          <OptionRow label="Assignee" hint="off by default" checked={!!opts.assignee} onChange={(v) => set({ assignee: v })} />
          <OptionRow label="Cycle" hint="off by default" checked={!!opts.cycle} onChange={(v) => set({ cycle: v })} />
        </div>

        <div className="mt-2 border-t pt-2">
          <OptionRow
            label="Dates"
            hint="off by default"
            checked={!!opts.dates}
            onChange={(v) => set({ dates: v })}
          />
          {opts.dates ? (
            <div className="ml-6 mt-1 space-y-2">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={opts.date_mode === "exact"}
                    onChange={() => set({ date_mode: "exact" })}
                  />
                  Keep exact dates
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={opts.date_mode === "shift"}
                    onChange={() => set({ date_mode: "shift" })}
                  />
                  Shift to new start
                </label>
              </div>
              {opts.date_mode === "shift" ? (
                <Input
                  type="date"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  aria-label="New start date"
                  className={cn("h-8 w-44", dateInvalid && "border-destructive")}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {hasChildren ? (
          <div className="mt-2 border-t pt-2">
            <OptionRow
              label={`Include child items (${preview.child_count})`}
              hint="copies the subtree; disabled by default"
              checked={!!opts.include_children}
              onChange={(v) => set({ include_children: v })}
            />
          </div>
        ) : null}

        <div className="mt-2 border-t pt-2">
          <OptionRow
            label="Relations"
            hint="external links; off by default"
            checked={!!opts.relations}
            onChange={(v) => set({ relations: v })}
          />
        </div>
      </fieldset>

      {clone.isError ? (
        <p className="text-sm text-destructive">Could not duplicate. Please try again.</p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={clone.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={clone.isPending || dateInvalid || !title.trim()}>
          {clone.isPending ? "Creating…" : "Create duplicate"}
        </Button>
      </DialogFooter>
    </div>
  );
}
