"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { EDashboardWidgetType } from "@/types";

import {
  WIDGET_CATEGORIES,
  WIDGET_CATEGORY,
  WIDGET_TYPE_LIST,
  type IWidgetTypeMeta,
  type TWidgetCategory,
} from "./widget-registry";

/** Catalogue split into its sections, filtered by a free-text query over name,
 *  description and category. Empty sections are dropped. */
function groupWidgets(query: string): { category: TWidgetCategory; items: IWidgetTypeMeta[] }[] {
  const q = query.trim().toLowerCase();
  const groups: { category: TWidgetCategory; items: IWidgetTypeMeta[] }[] = [];
  for (const category of WIDGET_CATEGORIES) {
    const items = WIDGET_TYPE_LIST.filter((meta) => {
      if (WIDGET_CATEGORY[meta.type] !== category) return false;
      return !q || `${meta.label} ${meta.description} ${category}`.toLowerCase().includes(q);
    });
    if (items.length > 0) groups.push({ category, items });
  }
  return groups;
}

/**
 * Bounded, searchable widget catalogue (GIN-488). Replaces the full-height
 * dropdown: the popover is capped at the smaller of 70vh / 640px / the space
 * Radix measures below the trigger (so it flips and never clips), the header
 * stays put, and only the result list scrolls — with a visible scrollbar and a
 * bottom fade while there is more below.
 */
export function AddWidgetPicker({
  disabled,
  addedTypes,
  onAdd,
}: {
  disabled: boolean;
  addedTypes: EDashboardWidgetType[];
  onAdd: (type: EDashboardWidgetType) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Add widget
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Add widget"
        className="flex w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        style={{ maxHeight: "min(70vh, 640px, var(--radix-popover-content-available-height))" }}
      >
        {/* Mounted only while open so each visit starts from an empty search. */}
        {open ? (
          <PickerBody
            addedTypes={addedTypes}
            onAdd={(type) => {
              onAdd(type);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PickerBody({
  addedTypes,
  onAdd,
  onClose,
}: {
  addedTypes: EDashboardWidgetType[];
  onAdd: (type: EDashboardWidgetType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // Is there more list below the fold? Measured off render — in a ref callback on
  // mount and on every scroll. The list is keyed by the query, so filtering
  // remounts it and re-measures.
  const [moreBelow, setMoreBelow] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const groups = groupWidgets(query);
  const added = new Set(addedTypes);

  const update = (el: HTMLDivElement) =>
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);

  const measure = (el: HTMLDivElement | null) => {
    listRef.current = el;
    // Radix sets the popover's available-height var just after mount, so an
    // immediate read still sees an unbounded (never-overflowing) list.
    if (el) requestAnimationFrame(() => update(el));
  };

  // Arrow/Home/End move focus between rows; PageUp/PageDown and the wheel scroll
  // the list natively once a row holds focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-widget-row]") ?? [],
    );
    if (rows.length === 0) return;
    e.preventDefault();
    const current = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? rows.length - 1
          : e.key === "ArrowDown"
            ? Math.min(current + 1, rows.length - 1)
            : Math.max(current - 1, 0);
    rows[current === -1 && e.key === "ArrowUp" ? rows.length - 1 : next]?.focus();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <header className="flex flex-col gap-2 border-b px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Add widget</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            autoFocus
            aria-label="Search widgets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search widgets…"
            className="h-9 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </header>

      {/* The scroll region IS the flex item (`min-h-0 flex-1`), so the popover's
          max-height caps the column, the header keeps its size and the list takes
          the remainder. A percentage max-height on a nested div would resolve to
          none here and leave the list unscrollable, merely clipped. */}
      <div
        key={query}
        ref={measure}
        onScroll={(e) => update(e.currentTarget)}
        className="gn-scroll-y min-h-0 flex-1 px-1.5 py-1.5"
      >
          {groups.map((group) => (
            <section key={group.category} aria-label={group.category}>
              <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.category}
              </h3>
              {group.items.map((meta) => (
                <button
                  key={meta.type}
                  type="button"
                  data-widget-row
                  onClick={() => onAdd(meta.type)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                    "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <HugeiconsIcon icon={meta.icon} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{meta.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {meta.description}
                    </span>
                  </span>
                  {added.has(meta.type) ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      Added
                    </span>
                  ) : null}
                  <HugeiconsIcon
                    icon={Add01Icon}
                    className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </button>
              ))}
            </section>
          ))}

          {groups.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              No widgets match “{query}”.
            </p>
          ) : null}
      </div>

      {/* Cue that more exists below; gone once the list is scrolled to the end. */}
      {moreBelow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent"
        />
      ) : null}
    </div>
  );
}
