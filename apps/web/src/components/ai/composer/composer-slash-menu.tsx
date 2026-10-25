"use client";

import { useEffect, useRef } from "react";

import type { IAgentCommand } from "@/constants/agent-commands";
import { cn } from "@/lib/utils";

function highlightMatch(text: string, query: string) {
  const q = query.replace(/^\//, "").trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/15 text-primary">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function ComposerSlashMenu({
  items,
  query,
  selected,
  onSelect,
  onHover,
  className,
}: {
  items: IAgentCommand[];
  query: string;
  selected: number;
  onSelect: (item: IAgentCommand) => void;
  onHover: (index: number) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!items.length) {
    return (
      <div
        className={cn(
          "t-dropdown is-open w-72 rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-md",
          className,
        )}
        data-origin="bottom-left"
      >
        No matching commands
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Slash commands"
      className={cn(
        "t-dropdown is-open max-h-64 w-80 overflow-y-auto rounded-lg border bg-popover py-1 shadow-md",
        className,
      )}
      data-origin="bottom-left"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          data-index={index}
          aria-selected={index === selected}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(item)}
          className={cn(
            "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors duration-150 ease-out",
            index === selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
          )}
        >
          <span className="text-sm font-medium text-foreground">
            {highlightMatch(item.slash, query)}
          </span>
          <span className="line-clamp-1 text-xs text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
