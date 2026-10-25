"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { filtersToGigsql } from "@/lib/views/gigsql-codec";
import {
  buildFilterPills,
  type TFilterPillId,
} from "@/lib/issues/filter-pills";
import { SORT_KEY_LABELS } from "@/lib/issues/story-sort";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label} filter`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted active:scale-[0.97]",
      )}
    >
      <span>{label}</span>
      <span aria-hidden>×</span>
    </button>
  );
}

/** Removable filter pills strip — facet pills or one GigsQL pill for complex queries. */
export function FilterPills() {
  const filters = useIssuesViewStore((s) => s.filters);
  const gigsqlQuery = useIssuesViewStore((s) => s.gigsqlQuery);
  const setFilterFacet = useIssuesViewStore((s) => s.setFilterFacet);
  const setFilterTitle = useIssuesViewStore((s) => s.setFilterTitle);
  const setDueRange = useIssuesViewStore((s) => s.setDueRange);
  const setCreatedRange = useIssuesViewStore((s) => s.setCreatedRange);
  const clearFilters = useIssuesViewStore((s) => s.clearFilters);
  const sort = useIssuesViewStore((s) => s.sort);
  const flipSortDir = useIssuesViewStore((s) => s.flipSortDir);
  const removeSortLevel = useIssuesViewStore((s) => s.removeSortLevel);

  const pills = buildFilterPills(filters, gigsqlQuery);
  if (!pills.length && !sort.length) return null;

  const clearPill = (id: TFilterPillId) => {
    if (id === "gigsql") {
      clearFilters();
      return;
    }
    if (id === "title") {
      setFilterTitle("");
      return;
    }
    if (id === "due") {
      setDueRange(null, null);
      return;
    }
    if (id === "created") {
      setCreatedRange(null, null);
      return;
    }
    if (id.startsWith("custom:")) {
      const fieldId = id.slice("custom:".length);
      useIssuesViewStore.setState((s) => {
        const custom = { ...s.filters.custom };
        delete custom[fieldId];
        const nextFilters = { ...s.filters, custom };
        return { filters: nextFilters, gigsqlQuery: filtersToGigsql(nextFilters) };
      });
      return;
    }
    if (
      id === "status" ||
      id === "priority" ||
      id === "assignee" ||
      id === "label" ||
      id === "type" ||
      id === "cycle" ||
      id === "module"
    ) {
      setFilterFacet(id, []);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      {pills.map((pill) => (
        <FilterPill key={pill.id} label={pill.label} onRemove={() => clearPill(pill.id)} />
      ))}
      {sort.map((level, index) => (
        <SortPill
          key={level.key}
          label={SORT_KEY_LABELS[level.key]}
          dir={level.dir}
          onFlip={() => flipSortDir(index)}
          onRemove={() => removeSortLevel(index)}
        />
      ))}
    </div>
  );
}

/**
 * One sort level, alongside the filter pills because both answer "why am I
 * looking at these rows, in this order". The body flips the direction and the
 * × removes the level — two targets, so neither action needs a menu.
 */
function SortPill({
  label,
  dir,
  onFlip,
  onRemove,
}: {
  label: string;
  dir: "asc" | "desc";
  onFlip: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 text-xs text-foreground">
      <button
        type="button"
        onClick={onFlip}
        aria-label={`${label} sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.`}
        className="inline-flex items-center gap-1 rounded-l-full py-1 pl-2.5 pr-1 transition-colors duration-150 hover:bg-muted active:scale-[0.97]"
      >
        <span className="t-icon-swap" data-state={dir === "asc" ? "a" : "b"}>
          <span className="t-icon flex" data-icon="a">
            <HugeiconsIcon icon={ArrowUp01Icon} className="size-3" />
          </span>
          <span className="t-icon flex" data-icon="b">
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" />
          </span>
        </span>
        <span>{label}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Stop sorting by ${label}`}
        className="rounded-r-full py-1 pl-1 pr-2.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97]"
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  );
}
