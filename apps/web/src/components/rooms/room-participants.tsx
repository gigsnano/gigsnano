"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IExpert } from "@/types/ai/rooms";

/**
 * The room's participants bar: a chip per expert in the room (colored monogram +
 * name + remove) and an "Add expert" dropdown of the experts not yet present.
 * The add button self-disables once every expert is already in the room.
 */
export function RoomParticipants({
  participants,
  experts,
  onAdd,
  onRemove,
}: {
  participants: IExpert[];
  experts: IExpert[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inRoom = new Set(participants.map((p) => p.id));
  const addable = experts.filter((e) => !inRoom.has(e.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2">
      {participants.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs duration-200 animate-in fade-in-0 zoom-in-95"
        >
          <span
            className="inline-flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: p.avatar_color }}
          >
            {p.name.slice(0, 1)}
          </span>
          {p.name}
          <button
            type="button"
            aria-label={`Remove ${p.name}`}
            className="-mr-0.5 flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => onRemove(p.id)}
          >
            ×
          </button>
        </span>
      ))}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={addable.length === 0}>
            + Add expert
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {addable.map((e) => (
            <DropdownMenuItem
              key={e.id}
              onClick={() => {
                onAdd(e.id);
                setOpen(false);
              }}
            >
              <span
                className="mr-2 inline-flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ backgroundColor: e.avatar_color }}
              >
                {e.name.slice(0, 1)}
              </span>
              {e.name}
              <span className="ml-1 text-xs text-muted-foreground">· {e.domain}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
