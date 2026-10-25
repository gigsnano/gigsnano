"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  STORY_PRIORITY_ORDER,
  STORY_PRIORITY_META,
  STORY_STATUS_ORDER,
  STORY_STATUS_META,
} from "@/constants/story-meta";
import {
  gigsqlToRows,
  rowsToGigsql,
  type IFilterRow,
} from "@/lib/views/gigsql-codec";
import { parseGigsql } from "@/lib/views/gigsql";

const VISUAL_FIELDS = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "label", label: "Label" },
  { key: "title", label: "Title" },
  { key: "dueDate", label: "Due date" },
  { key: "createdAt", label: "Created" },
] as const;

const FIELD_OPERATORS: Record<string, string[]> = {
  status: ["=", "!=", "in", "not in", "is null"],
  priority: ["=", "!=", "in", "not in"],
  assignee: ["=", "!=", "in", "not in", "is null"],
  label: ["=", "!=", "in", "not in"],
  title: ["=", "!=", "~"],
  dueDate: ["=", "!=", "<", "<=", ">", ">=", "between", "is null"],
  createdAt: ["=", "!=", "<", "<=", ">", ">=", "between", "is null"],
};

function defaultOperator(field: string): string {
  return FIELD_OPERATORS[field]?.[0] ?? "=";
}

function emptyRow(): IFilterRow {
  return { id: "1", field: "status", operator: "=", value: "" };
}

/** Visual GigsQL builder — AND-joined field / operator / value rows. */
export function AdvancedFilterBuilder({
  query,
  onChange,
  assigneeOptions = [],
  labelOptions = [],
}: {
  query: string;
  onChange: (query: string) => void;
  assigneeOptions?: { value: string; label: string }[];
  labelOptions?: { value: string; label: string }[];
}) {
  const visualRows = gigsqlToRows(query);
  const parsed = parseGigsql(query);
  const readOnly =
    query.trim().length > 0 && visualRows === null && parsed.kind === "ok";

  const [draftRows, setDraftRows] = useState<IFilterRow[] | null>(null);
  const rows = draftRows ?? visualRows ?? (query.trim() ? [] : [emptyRow()]);

  const commitRows = (next: IFilterRow[]) => {
    setDraftRows(next);
    onChange(rowsToGigsql(next));
  };

  const updateRow = (id: string, patch: Partial<IFilterRow>) => {
    commitRows(
      rows.map((row) => {
        if (row.id !== id) return row;
        const merged = { ...row, ...patch };
        if (patch.field && patch.field !== row.field) {
          merged.operator = defaultOperator(patch.field);
          merged.value = "";
        }
        return merged;
      }),
    );
  };

  const addRow = () => {
    const maxId = rows.reduce((n, r) => Math.max(n, Number.parseInt(r.id, 10) || 0), 0);
    commitRows([...rows, { id: String(maxId + 1), field: "status", operator: "=", value: "" }]);
  };

  const removeRow = (id: string) => {
    const next = rows.filter((r) => r.id !== id);
    commitRows(next.length ? next : [emptyRow()]);
  };

  if (readOnly) {
    return (
      <div className="space-y-2 px-3 py-3">
        <p className="text-xs text-muted-foreground">
          This query uses OR, grouping, or operators the visual builder cannot edit. Switch to
          GigsQL mode to change it.
        </p>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs text-foreground">
          {query}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-3">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-start gap-1.5">
          {index > 0 ? (
            <span className="mt-2 w-8 shrink-0 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              AND
            </span>
          ) : (
            <span className="w-8 shrink-0" />
          )}
          <div className="grid min-w-0 flex-1 gap-1.5">
            <select
              aria-label="Filter field"
              value={row.field}
              onChange={(e) => updateRow(row.id, { field: e.target.value })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {VISUAL_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <select
                aria-label="Filter operator"
                value={row.operator}
                onChange={(e) => updateRow(row.id, { operator: e.target.value })}
                className="h-8 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
              >
                {(FIELD_OPERATORS[row.field] ?? ["="]).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {row.operator === "is null" ? null : (
                <ValueInput
                  field={row.field}
                  operator={row.operator}
                  value={row.value}
                  assigneeOptions={assigneeOptions}
                  labelOptions={labelOptions}
                  onChange={(value) => updateRow(row.id, { value })}
                />
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove filter row"
            className="mt-1 shrink-0 text-muted-foreground transition-transform active:scale-[0.97]"
            onClick={() => removeRow(row.id)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-full justify-start gap-1.5 text-xs transition-transform active:scale-[0.97]"
        onClick={addRow}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
        Add condition
      </Button>
    </div>
  );
}

function ValueInput({
  field,
  operator,
  value,
  assigneeOptions,
  labelOptions,
  onChange,
}: {
  field: string;
  operator: string;
  value: string;
  assigneeOptions: { value: string; label: string }[];
  labelOptions: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  if (field === "status" && operator !== "in" && operator !== "not in") {
    return (
      <select
        aria-label="Filter value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Select…</option>
        {STORY_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STORY_STATUS_META[s].label}
          </option>
        ))}
      </select>
    );
  }

  if (field === "priority" && operator !== "in" && operator !== "not in") {
    return (
      <select
        aria-label="Filter value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Select…</option>
        {STORY_PRIORITY_ORDER.map((p) => (
          <option key={p} value={p}>
            {STORY_PRIORITY_META[p].label}
          </option>
        ))}
      </select>
    );
  }

  if (field === "assignee" && operator !== "in" && operator !== "not in") {
    return (
      <select
        aria-label="Filter value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Select…</option>
        <option value="me">Me</option>
        <option value="unassigned">Unassigned</option>
        {assigneeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field === "label" && operator !== "in" && operator !== "not in") {
    return (
      <select
        aria-label="Filter value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Select…</option>
        {labelOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  const placeholder =
    operator === "between"
      ? "YYYY-MM-DD..YYYY-MM-DD"
      : operator === "in" || operator === "not in"
        ? "value1, value2"
        : field === "title"
          ? "Contains…"
          : "Value";

  return (
    <Input
      aria-label="Filter value"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 min-w-0 flex-1 text-sm")}
    />
  );
}
