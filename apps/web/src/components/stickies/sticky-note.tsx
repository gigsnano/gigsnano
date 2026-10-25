"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { PaintBoardIcon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import { useDeleteSticky, useUpdateSticky } from "@/hooks/workspace/use-stickies";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import type { ISticky } from "@/types";

import { STICKY_COLORS } from "./sticky-colors";

/** Small deterministic tilt so a wall of notes feels hand-placed, not gridded. */
const TILTS = [-2, 1.4, -1, 1.8, -1.6, 0.8];

export function StickyNote({
  sticky,
  workspaceSlug,
  index,
  autoFocus = false,
}: {
  sticky: ISticky;
  workspaceSlug: string;
  index: number;
  autoFocus?: boolean;
}) {
  const update = useUpdateSticky(workspaceSlug, sticky.id);
  const remove = useDeleteSticky(workspaceSlug);
  const [body, setBody] = useAdjustedState(sticky.body);

  const color = sticky.color;
  const rot = TILTS[index % TILTS.length];

  const saveBody = () => {
    const next = body.trim();
    if (next !== sticky.body) update.mutate({ body: next });
  };

  return (
    <div className="t-sticky" style={{ ["--i" as string]: Math.min(index, 12) }}>
      <div
        className="t-sticky-card relative flex min-h-[220px] flex-col rounded-2xl border p-4"
        style={{
          ["--rot" as string]: `${rot}deg`,
          background: `color-mix(in oklab, ${color} 28%, var(--card))`,
          borderColor: `color-mix(in oklab, ${color} 45%, var(--border))`,
        }}
      >
        <Label id={`sticky-body-label-${sticky.id}`} htmlFor={`sticky-body-${sticky.id}`} className="sr-only">
          Sticky note content
        </Label>
        <textarea
          id={`sticky-body-${sticky.id}`}
          aria-labelledby={`sticky-body-label-${sticky.id}`}
          autoFocus={autoFocus}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveBody}
          placeholder="Click to type here"
          spellCheck={false}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-foreground/40"
        />

        <div className="mt-3 flex items-center justify-between">
          {/* Color picker — every note can be tinted independently. */}
          <Popover>
            <PopoverTrigger
              aria-label="Change color"
              className="flex size-7 items-center justify-center rounded-md text-foreground/60 transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground active:scale-95"
            >
              <HugeiconsIcon icon={PaintBoardIcon} className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="w-auto origin-[var(--radix-popover-content-transform-origin)] p-2"
            >
              <div className="flex items-center gap-1.5">
                {STICKY_COLORS.map((c) => {
                  const selected = c.value.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-label={c.name}
                      aria-pressed={selected}
                      onClick={() => update.mutate({ color: c.value })}
                      className="flex size-6 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 active:scale-95"
                      style={{
                        backgroundColor: c.value,
                        boxShadow: selected
                          ? `0 0 0 2px var(--card), 0 0 0 4px ${c.value}`
                          : undefined,
                      }}
                    >
                      {selected ? (
                        <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-white" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            aria-label="Delete sticky"
            disabled={remove.isPending}
            onClick={() => remove.mutate(sticky.id)}
            className="flex size-7 items-center justify-center rounded-md text-foreground/50 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-95 disabled:opacity-50"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
