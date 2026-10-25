"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";

import { useUpdateWorkspace, useWorkspace } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IWorkspaceHoliday } from "@/types";

/**
 * The workspace's non-working days.
 *
 * Per workspace rather than derived from a country: a UAE tenant and an Indian
 * one share almost no public holidays, and a preset would be confidently wrong
 * for one of them. Company days off aren't in any preset either.
 *
 * Saved on each edit rather than behind a Save button — the list is the whole
 * form, so there is no half-finished state worth holding onto, and the server
 * dedupes and sorts whatever it is sent.
 */
export function HolidayCalendar({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: workspace, isPending } = useWorkspace(workspaceSlug);
  const update = useUpdateWorkspace(workspaceSlug);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const holidays = workspace?.holidays ?? [];
  const save = (next: IWorkspaceHoliday[]) => update.mutate({ holidays: next });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) return;
    save([...holidays, { date, name: name.trim() }]);
    setDate("");
    setName("");
  };

  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="text-sm font-semibold">Holiday calendar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Days nobody is working. Charts leave these out alongside weekends, so a public holiday
        doesn&apos;t read as a quiet day.
      </p>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="gn-holiday-date">Date</Label>
          <Input
            id="gn-holiday-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="gn-holiday-name">Name</Label>
          <Input
            id="gn-holiday-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Eid al-Fitr"
          />
        </div>
        <Button type="submit" size="sm" disabled={!date || !name.trim() || update.isPending}>
          Add
        </Button>
      </form>

      {update.isError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Couldn&apos;t save the calendar. Please try again.
        </p>
      ) : null}

      <div className="mt-4 divide-y rounded-lg border">
        {isPending ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : holidays.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No holidays yet. Charts currently exclude weekends only.
          </p>
        ) : (
          holidays.map((h) => (
            <div key={h.date} className="flex items-center gap-3 px-3 py-2">
              <span className="w-28 shrink-0 text-sm tabular-nums text-muted-foreground">
                {h.date}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{h.name}</span>
              <button
                type="button"
                aria-label={`Remove ${h.name}`}
                disabled={update.isPending}
                onClick={() => save(holidays.filter((x) => x.date !== h.date))}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
