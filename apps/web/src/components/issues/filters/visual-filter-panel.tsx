"use client";

import { useState, type ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Search01Icon,
  Tick02Icon,
  Add01Icon,
  TextIcon,
  Tag01Icon,
  UserIcon,
  Calendar03Icon,
  CircleIcon,
} from "@hugeicons/core-free-icons";

import {
  STORY_PRIORITY_META,
  STORY_PRIORITY_ORDER,
  STORY_STATUS_META,
  STORY_STATUS_ORDER,
  STORY_TYPE_META,
  STORY_TYPE_ORDER,
} from "@/constants/story-meta";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  FIELD_CATEGORY_LABEL,
  FIELD_CATEGORY_ORDER,
  fieldByKey,
  type TFieldCategory,
  type TFieldDataType,
} from "@/lib/issues/field-registry";
import { cn } from "@/lib/utils";

import { PriorityGlyph } from "../shared/priority-glyph";
import { StatusIcon } from "../shared/status-icon";
import { TypeGlyph } from "../shared/type-glyph";

export interface IFilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

type TFieldKind = "select" | "text" | "dateRange";

interface IFilterField {
  key: string;
  label: string;
  kind: TFieldKind;
  /** Canonical registry field key (for category/dataType lookup); defaults to `key`. */
  registryKey?: string;
  /** Count shown in the left-rail badge + the "active" summary. */
  activeCount: number;
  clear: () => void;
  // select
  options?: IFilterOption[];
  searchable?: boolean;
  selected?: string[];
  toggle?: (value: string) => void;
  // text
  text?: string;
  setText?: (value: string) => void;
  // dateRange
  from?: string | null;
  to?: string | null;
  setRange?: (from: string | null, to: string | null) => void;
}

const NONE_VALUE = "__none__";

/** Small glyph shown beside a field in the "Add field" selector, by data type. */
const DATA_TYPE_ICON: Record<TFieldDataType, IconSvgElement> = {
  text: TextIcon,
  select: Tag01Icon,
  person: UserIcon,
  date: Calendar03Icon,
  number: CircleIcon,
  count: CircleIcon,
  boolean: CircleIcon,
};

/** Resolve a panel field's registry category + type-icon (custom fields → Custom). */
function fieldMeta(field: IFilterField): { category: TFieldCategory; icon: IconSvgElement } {
  const def = fieldByKey(field.registryKey ?? field.key);
  const category: TFieldCategory = def?.category ?? "custom";
  const dataType: TFieldDataType = def?.dataType ?? "select";
  return { category, icon: DATA_TYPE_ICON[dataType] };
}

/**
 * Jira-style two-column visual filter: a field list on the left, the selected
 * field's editor (searchable icon checkboxes, a text input, or a native date
 * range) on the right. Core facets are always shown; the registry-driven,
 * searchable "Add field" selector reveals the rest (Title / Cycle / Module /
 * Due / Created). Every field writes a store facet, so the shared GigsQL query
 * stays in sync and the GigsQL tab round-trips. Field identity + categories come
 * from the canonical Work Item Field Registry (GIN-313).
 */
export function VisualFilterPanel({
  assigneeOptions,
  labelOptions,
  cycleOptions,
  moduleOptions,
  selectFields,
}: {
  assigneeOptions: IFilterOption[];
  labelOptions: IFilterOption[];
  cycleOptions: IFilterOption[];
  moduleOptions: IFilterOption[];
  selectFields: { id: string; name: string; options: string[] }[];
}) {
  const filters = useIssuesViewStore((s) => s.filters);
  const toggle = useIssuesViewStore((s) => s.toggleFilter);
  const toggleCustom = useIssuesViewStore((s) => s.toggleCustomFilter);
  const setFacet = useIssuesViewStore((s) => s.setFilterFacet);
  const setTitle = useIssuesViewStore((s) => s.setFilterTitle);
  const setDueRange = useIssuesViewStore((s) => s.setDueRange);
  const setCreatedRange = useIssuesViewStore((s) => s.setCreatedRange);

  // Plain computation — React Compiler memoizes; no hand-rolled useMemo.
  const std = (
    key: "status" | "priority" | "type" | "assignee" | "label" | "cycle" | "module",
    label: string,
    options: IFilterOption[],
    searchable = false,
  ): IFilterField => ({
    key,
    label,
    kind: "select",
    options,
    searchable,
    selected: filters[key],
    activeCount: filters[key].length,
    toggle: (v) => toggle(key, v),
    clear: () => setFacet(key, []),
  });

  const custom = selectFields.flatMap<IFilterField>((f) => {
    if (!f.options.length) return [];
    const selected = filters.custom[f.id] ?? [];
    return [
      {
        key: `cf:${f.id}`,
        label: f.name,
        kind: "select",
        options: [
          ...f.options.map((o) => ({ value: o, label: o })),
          { value: NONE_VALUE, label: "None" },
        ],
        searchable: f.options.length > 8,
        selected,
        activeCount: selected.length,
        toggle: (v) => toggleCustom(f.id, v),
        clear: () => selected.forEach((v) => toggleCustom(f.id, v)),
      },
    ];
  });

  const core: IFilterField[] = [
    std("status", "Status", STORY_STATUS_ORDER.map((s) => ({
      value: s,
      label: STORY_STATUS_META[s].label,
      icon: <StatusIcon status={s} />,
    }))),
    std("type", "Work type", STORY_TYPE_ORDER.map((t) => ({
      value: t,
      label: STORY_TYPE_META[t].label,
      icon: <TypeGlyph type={t} className="size-3.5" />,
    }))),
    std("priority", "Priority", STORY_PRIORITY_ORDER.map((p) => ({
      value: p,
      label: STORY_PRIORITY_META[p].label,
      icon: <PriorityGlyph priority={p} />,
    }))),
    std(
      "assignee",
      "Assignee",
      [...assigneeOptions, { value: "unassigned", label: "Unassigned" }],
      true,
    ),
    std("label", "Labels", labelOptions, labelOptions.length > 8),
    ...custom,
  ];

  // Extra fields behind "Add field": select facets (cycle/module), a text input
  // (title), or native date ranges (due/created). `registryKey` maps each to its
  // canonical registry field for category grouping + the type icon.
  const dueActive = Boolean(filters.dueFrom || filters.dueTo);
  const createdActive = Boolean(filters.createdFrom || filters.createdTo);
  const titleActive = Boolean(filters.title.trim());
  const extraDefs: (IFilterField & { alwaysWhen: boolean })[] = [
    {
      key: "title",
      label: "Title",
      kind: "text",
      text: filters.title,
      setText: setTitle,
      activeCount: titleActive ? 1 : 0,
      clear: () => setTitle(""),
      alwaysWhen: titleActive,
    },
    {
      ...std("cycle", "Cycle", cycleOptions, cycleOptions.length > 8),
      alwaysWhen: filters.cycle.length > 0,
    },
    {
      ...std("module", "Module", moduleOptions, moduleOptions.length > 8),
      alwaysWhen: filters.module.length > 0,
    },
    {
      key: "due",
      registryKey: "target_date",
      label: "Due date",
      kind: "dateRange",
      from: filters.dueFrom,
      to: filters.dueTo,
      setRange: setDueRange,
      activeCount: dueActive ? 1 : 0,
      clear: () => setDueRange(null, null),
      alwaysWhen: dueActive,
    },
    {
      key: "created",
      registryKey: "created_at",
      label: "Created date",
      kind: "dateRange",
      from: filters.createdFrom,
      to: filters.createdTo,
      setRange: setCreatedRange,
      activeCount: createdActive ? 1 : 0,
      clear: () => setCreatedRange(null, null),
      alwaysWhen: createdActive,
    },
  ];

  const [added, setAdded] = useState<string[]>([]);
  // An extra field is visible if the user added it, or it already carries a value.
  const visibleExtra = extraDefs.filter((f) => added.includes(f.key) || f.alwaysWhen);
  const addable = extraDefs.filter((f) => !added.includes(f.key) && !f.alwaysWhen);

  const fields: IFilterField[] = [...core, ...visibleExtra];

  const [activeKey, setActiveKey] = useState(fields[0]?.key ?? "status");
  const [query, setQuery] = useState("");
  const active = fields.find((f) => f.key === activeKey) ?? fields[0];

  if (!active) return null;

  const addField = (key: string) => {
    setAdded((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setActiveKey(key);
    setQuery("");
  };

  return (
    <div className="flex flex-col">
      <div className="flex min-h-[15rem]">
        {/* Field list */}
        <nav className="flex w-36 shrink-0 flex-col border-r py-1">
          {fields.map((field) => {
            const isActive = field.key === active.key;
            return (
              <button
                key={field.key}
                type="button"
                onClick={() => {
                  setActiveKey(field.key);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{field.label}</span>
                {field.activeCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                    {field.activeCount}
                  </span>
                ) : null}
              </button>
            );
          })}

          {addable.length > 0 ? (
            <AddFieldSelector addable={addable} onAdd={addField} />
          ) : null}
        </nav>

        {/* Editor for the active field */}
        <div
          key={active.key}
          className="flex min-w-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          {active.kind === "select" ? (
            <SelectPane active={active} query={query} setQuery={setQuery} />
          ) : active.kind === "text" ? (
            <TextPane active={active} />
          ) : (
            <DateRangePane active={active} />
          )}
        </div>
      </div>

      {/* Per-field footer */}
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        {active.kind === "select" ? (
          <span className="tabular-nums">
            {active.activeCount} of {active.options?.length ?? 0}
          </span>
        ) : (
          <span className="tabular-nums">{active.activeCount > 0 ? "1 filter" : "No filter"}</span>
        )}
        {active.activeCount > 0 ? (
          <button
            type="button"
            onClick={active.clear}
            className="rounded-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Clear {active.label.toLowerCase()}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Searchable, categorized "Add field" selector (GIN-313). Registry categories
 * group the addable fields; cmdk gives search, keyboard nav, and accessible
 * focus for free. Each item shows a data-type glyph.
 */
function AddFieldSelector({
  addable,
  onAdd,
}: {
  addable: IFilterField[];
  onAdd: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const grouped: { category: TFieldCategory; fields: IFilterField[] }[] = [];
  for (const category of FIELD_CATEGORY_ORDER) {
    const fields = addable.filter((f) => fieldMeta(f).category === category);
    if (fields.length) grouped.push({ category, fields });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "mt-auto flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
          )}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5 shrink-0" />
          Add field
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Search fields…" />
          <CommandList>
            <CommandEmpty>No fields found.</CommandEmpty>
            {grouped.map(({ category, fields }) => (
              <CommandGroup key={category} heading={FIELD_CATEGORY_LABEL[category]}>
                {fields.map((f) => (
                  <CommandItem
                    key={f.key}
                    value={f.label}
                    onSelect={() => {
                      onAdd(f.key);
                      setOpen(false);
                    }}
                  >
                    <HugeiconsIcon
                      icon={fieldMeta(f).icon}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1 truncate">{f.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable icon-checkbox list (status/type/priority/assignee/labels/custom). */
function SelectPane({
  active,
  query,
  setQuery,
}: {
  active: IFilterField;
  query: string;
  setQuery: (q: string) => void;
}) {
  const selectedSet = new Set(active.selected ?? []);
  const q = query.trim().toLowerCase();
  const options = active.options ?? [];
  const visibleOptions = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  return (
    <>
      {active.searchable ? (
        <div className="border-b p-2">
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 focus-within:border-ring">
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${active.label.toLowerCase()}`}
              aria-label={`Search ${active.label}`}
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visibleOptions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches.</p>
        ) : (
          visibleOptions.map((option) => {
            const checked = selectedSet.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => active.toggle?.(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {/* Tick scales in (never from scale(0)) — Emil: nothing appears from nothing. */}
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    className={cn(
                      "size-3 transition-[transform,opacity] duration-150 ease-out",
                      checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
                    )}
                  />
                </span>
                {option.icon ? (
                  <span className="flex w-4 shrink-0 items-center justify-center">{option.icon}</span>
                ) : null}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left",
                    option.value === NONE_VALUE && "text-muted-foreground",
                  )}
                >
                  {option.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

const fieldInput =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

/** Title-contains text field. */
function TextPane({ active }: { active: IFilterField }) {
  return (
    <div className="flex-1 space-y-1.5 p-3">
      <label className="text-xs font-medium text-muted-foreground" htmlFor="filter-title">
        Title contains
      </label>
      <input
        id="filter-title"
        value={active.text ?? ""}
        onChange={(e) => active.setText?.(e.target.value)}
        placeholder="e.g. login"
        className={fieldInput}
      />
    </div>
  );
}

/** Native from/to date range (ponytail: native date inputs over a picker lib). */
function DateRangePane({ active }: { active: IFilterField }) {
  const from = active.from ?? "";
  const to = active.to ?? "";
  return (
    <div className="grid flex-1 grid-cols-2 gap-2 p-3">
      <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
        From
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => active.setRange?.(e.target.value || null, active.to ?? null)}
          aria-label={`${active.label} from`}
          className={fieldInput}
        />
      </label>
      <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
        To
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => active.setRange?.(active.from ?? null, e.target.value || null)}
          aria-label={`${active.label} to`}
          className={fieldInput}
        />
      </label>
    </div>
  );
}
