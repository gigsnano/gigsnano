"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { MAX_SORT_LEVELS, SORT_KEYS, SORT_KEY_LABELS } from "@/lib/issues/story-sort";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";

/**
 * The stacked sort control (GIN — "priority desc, then due date asc").
 *
 * Levels apply in order, so the panel is a list rather than a single select:
 * the sequence is the meaning, and a list is the only shape that shows it.
 * An empty list is Manual — stated in words, because "no sort" and "sorted by
 * the order you dragged" look identical otherwise.
 */
export function SortPanel() {
  const sort = useIssuesViewStore((s) => s.sort);
  const addSortLevel = useIssuesViewStore((s) => s.addSortLevel);
  const setSortLevelKey = useIssuesViewStore((s) => s.setSortLevelKey);
  const flipSortDir = useIssuesViewStore((s) => s.flipSortDir);
  const removeSortLevel = useIssuesViewStore((s) => s.removeSortLevel);
  const reorderSortLevels = useIssuesViewStore((s) => s.reorderSortLevels);
  const clearSort = useIssuesViewStore((s) => s.clearSort);

  const used = new Set(sort.map((l) => l.key));
  const nextKey = SORT_KEYS.find((k) => !used.has(k));
  const atCap = sort.length >= MAX_SORT_LEVELS;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Sort</span>
        {sort.length > 0 ? (
          <button
            type="button"
            onClick={clearSort}
            className="text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      {sort.length === 0 ? (
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
          Manual — drag rows into the order you want.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sort.map((level, index) => (
            <li
              key={level.key}
              className="t-sort-level flex items-center gap-1 rounded-md border bg-card px-1 py-1"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/sort-index", String(index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/sort-index"));
                if (!Number.isNaN(from) && from !== index) reorderSortLevels(from, index);
              }}
            >
              <span
                aria-hidden
                className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
              >
                <HugeiconsIcon icon={DragDropVerticalIcon} className="size-3.5" />
              </span>

              {/* Native select: the option list is short, and a custom listbox
                  inside an already-open popover is a focus trap for no gain. */}
              <select
                value={level.key}
                onChange={(e) => setSortLevelKey(index, e.target.value as typeof level.key)}
                aria-label={`Sort level ${index + 1} field`}
                className="min-w-0 flex-1 cursor-pointer truncate rounded bg-transparent px-1 py-0.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {/* This level's own key, plus whatever no other level claimed. */}
                {SORT_KEYS.flatMap((k) =>
                  k === level.key || !used.has(k)
                    ? [
                        <option key={k} value={k}>
                          {SORT_KEY_LABELS[k]}
                        </option>,
                      ]
                    : [],
                )}
              </select>

              <button
                type="button"
                onClick={() => flipSortDir(index)}
                aria-label={`${SORT_KEY_LABELS[level.key]} is ${
                  level.dir === "asc" ? "ascending" : "descending"
                }. Activate to reverse.`}
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97]"
              >
                {/* Both arrows stay mounted and cross-fade in one slot
                    (transitions.dev #09) — the direction reads as reversing
                    rather than as one glyph being replaced by another. */}
                <span className="t-icon-swap" data-state={level.dir === "asc" ? "a" : "b"}>
                  <span className="t-icon flex" data-icon="a">
                    <HugeiconsIcon icon={ArrowUp01Icon} className="size-3.5" />
                  </span>
                  <span className="t-icon flex" data-icon="b">
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
                  </span>
                </span>
                {level.dir === "asc" ? "Asc" : "Desc"}
              </button>

              <button
                type="button"
                onClick={() => removeSortLevel(index)}
                aria-label={`Remove ${SORT_KEY_LABELS[level.key]} from the sort`}
                className="shrink-0 rounded p-1 text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97]"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={atCap || !nextKey}
        onClick={() => nextKey && addSortLevel(nextKey)}
        title={atCap ? `Up to ${MAX_SORT_LEVELS} levels` : undefined}
        className={cn(
          "mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150",
          atCap || !nextKey
            ? "cursor-not-allowed text-muted-foreground/50"
            : "text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.99]",
        )}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
        Add sort
      </button>
    </div>
  );
}
