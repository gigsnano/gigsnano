"use client";

import {
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Editor, Range } from "@tiptap/core";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { cn } from "@/lib/utils";

export interface SlashItem {
  title: string;
  description: string;
  icon: IconSvgElement;
  /** Extra words matched by the query, beyond `title`. */
  searchTerms?: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

export interface SlashMenuHandle {
  /** Returns true if the key was handled by the menu. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  ref?: Ref<SlashMenuHandle>;
}

function itemsKey(items: SlashItem[]) {
  return items.map((item) => item.title).join("\0");
}

function SlashMenuBody({ items, command, ref }: SlashMenuProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active row scrolled into view.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === "ArrowUp") {
        setSelected((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="w-72 rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-md">
        No matching blocks
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="max-h-80 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          data-index={index}
          onMouseEnter={() => setSelected(index)}
          onClick={() => command(item)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
            index === selected ? "bg-accent" : "hover:bg-accent/60",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
            <HugeiconsIcon icon={item.icon} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The `/` command palette rendered inside the editor. Keyboard-navigable
 * (↑/↓/Enter/Escape); the host suggestion plugin forwards keys via the ref.
 */
export function SlashMenu({ items, command, ref }: SlashMenuProps) {
  return (
    <SlashMenuBody
      key={itemsKey(items)}
      items={items}
      command={command}
      ref={ref}
    />
  );
}
