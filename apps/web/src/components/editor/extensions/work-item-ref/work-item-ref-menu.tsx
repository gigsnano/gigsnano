"use client";

import { type Ref, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { IWorkItemRefTarget } from "./types";

export interface WorkItemRefMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface WorkItemRefMenuProps {
  items: IWorkItemRefTarget[];
  command: (item: IWorkItemRefTarget) => void;
  ref?: Ref<WorkItemRefMenuHandle>;
}

function itemsKey(items: IWorkItemRefTarget[]) {
  return items.map((item) => item.id).join("\0");
}

function WorkItemRefMenuBody({ items, command, ref }: WorkItemRefMenuProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemsKeyValue = itemsKey(items);
  const [prevItemsKey, setPrevItemsKey] = useState(itemsKeyValue);

  if (itemsKeyValue !== prevItemsKey) {
    setPrevItemsKey(itemsKeyValue);
    setSelected(0);
  }

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
        No matching work items
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Reference a work item"
      className="max-h-56 w-72 overflow-y-auto rounded-lg border bg-popover py-1 shadow-md"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selected}
          data-index={index}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
            index === selected && "bg-accent",
          )}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setSelected(index)}
          onClick={() => command(item)}
        >
          <span className="shrink-0 font-mono text-xs font-medium text-primary">{item.code}</span>
          <span className="truncate text-foreground">{item.title}</span>
        </button>
      ))}
    </div>
  );
}

export const WorkItemRefMenu = WorkItemRefMenuBody;
