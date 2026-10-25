"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { tableRelations } from "@/lib/erd/fk-tree";
import type { IErdRelation, IErdSchema, IErdTable } from "@/types";

/**
 * Liam-style details panel for a selected ER table: its columns (with PK/FK/type)
 * and the relations it participates in, split into outgoing (References) and
 * incoming (Referenced by). Each relation row jumps to the other table, which
 * re-focuses the graph. Rendered as an overlay inside the canvas so it works in
 * both the compact chat canvas and the full-height codebase Schema tab.
 */
export function ErdDetailsPanel({
  table,
  schema,
  onSelectTable,
  onClose,
}: {
  table: IErdTable;
  schema: IErdSchema;
  onSelectTable: (name: string) => void;
  onClose: () => void;
}) {
  const { references, referencedBy } = tableRelations(schema, table.name);

  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-72 flex-col border-l bg-card shadow-lg duration-200 animate-in slide-in-from-right-4 fade-in">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="truncate text-sm font-semibold text-foreground">{table.name}</span>
        <button
          type="button"
          aria-label="Close table details"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section>
          <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Columns ({table.columns.length})
          </h4>
          <ul className="space-y-0.5">
            {table.columns.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs"
              >
                <span className={cn("truncate text-foreground", c.pk && "font-semibold")}>
                  {c.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  {c.pk ? (
                    <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
                      PK
                    </span>
                  ) : null}
                  {c.fk ? (
                    <span className="rounded bg-accent px-1 text-[10px] font-medium text-accent-foreground">
                      FK
                    </span>
                  ) : null}
                  <span className="text-[10px]">{c.type}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {references.length > 0 ? (
          <RelationSection
            title="References"
            relations={references}
            resolve={(r) => ({ column: r.from_column, other: r.to_table, otherColumn: r.to_column })}
            onSelectTable={onSelectTable}
          />
        ) : null}

        {referencedBy.length > 0 ? (
          <RelationSection
            title="Referenced by"
            relations={referencedBy}
            resolve={(r) => ({ column: r.to_column, other: r.from_table, otherColumn: r.from_column })}
            onSelectTable={onSelectTable}
          />
        ) : null}
      </div>
    </aside>
  );
}

function RelationSection({
  title,
  relations,
  resolve,
  onSelectTable,
}: {
  title: string;
  relations: IErdRelation[];
  resolve: (r: IErdRelation) => { column: string; other: string; otherColumn: string };
  onSelectTable: (name: string) => void;
}) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({relations.length})
      </h4>
      <ul className="space-y-0.5">
        {relations.map((r) => {
          const { column, other, otherColumn } = resolve(r);
          return (
            <li key={`${r.from_table}.${r.from_column}->${r.to_table}.${r.to_column}`}>
              <button
                type="button"
                onClick={() => onSelectTable(other)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent/50 active:scale-[0.99]"
              >
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{column}</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-3 shrink-0 text-muted-foreground/60"
                />
                <span className="truncate font-medium text-foreground">{other}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  .{otherColumn}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
