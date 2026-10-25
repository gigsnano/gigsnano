"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useDeleteInitiative, useInitiativeRollup, useUpdateInitiative } from "@/hooks/roadmap/use-roadmap";
import { cn } from "@/lib/utils";
import type { IInitiative } from "@/types";

import { SlipBadge } from "./slip-badge";

const STATUS = ["planned", "in_progress", "paused", "done"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function statusLabel(s: string) {
  return s.replace("_", " ");
}

/** Format a date-only "YYYY-MM-DD" → "Mon D" without Date/locale (SSR-safe). */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}

type Draft = { title: string; status: string; target_date: string };

export function InitiativeRow({
  workspaceSlug,
  initiative,
}: {
  workspaceSlug: string;
  initiative: IInitiative;
}) {
  const { data: rollup } = useInitiativeRollup(workspaceSlug, initiative.id);
  const update = useUpdateInitiative(workspaceSlug, initiative.id);
  const del = useDeleteInitiative(workspaceSlug);
  const [draft, setDraft] = useState<Draft | null>(null);

  const pct = rollup?.progress_pct ?? 0;

  if (draft) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <Input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          aria-label="Initiative title"
          className="font-medium"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            aria-label="Status"
            className="rounded-md border bg-background px-2 py-1.5 text-sm capitalize outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={draft.target_date}
            onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
            aria-label="Target date"
            className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draft.title.trim() || update.isPending}
              onClick={() =>
                update.mutate(
                  {
                    title: draft.title.trim(),
                    status: draft.status,
                    target_date: draft.target_date || null,
                  },
                  { onSuccess: () => setDraft(null) },
                )
              }
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-4 rounded-xl border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{initiative.title}</span>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
            {statusLabel(initiative.status)}
          </span>
          {rollup ? <SlipBadge signal={rollup.slip_signal} reason={rollup.slip_reason} /> : null}
        </div>
        {initiative.description ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">{initiative.description}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full bg-primary transition-[width] duration-500 ease-out")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {initiative.target_date ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {shortDate(initiative.target_date)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No date</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Initiative actions">
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                setDraft({
                  title: initiative.title,
                  status: initiative.status,
                  target_date: initiative.target_date ?? "",
                })
              }
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => del.mutate(initiative.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
