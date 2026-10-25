"use client";

import { useStaffMembers } from "@/hooks/admin/use-admin";
import { EAuditAction, type IAuditLogFilters } from "@/types";

import { formatAction } from "./format-action";

/** Local YYYY-MM-DD -> UTC day-boundary ISO datetime, or undefined for an empty input. */
function toIsoStart(dateInput: string): string | undefined {
  return dateInput ? `${dateInput}T00:00:00.000Z` : undefined;
}

function toIsoEnd(dateInput: string): string | undefined {
  return dateInput ? `${dateInput}T23:59:59.999Z` : undefined;
}

export function AuditFilters({
  filters,
  onFiltersChange,
}: {
  filters: IAuditLogFilters;
  onFiltersChange: (filters: IAuditLogFilters) => void;
}) {
  const { data: members = [] } = useStaffMembers();

  function update(patch: Partial<IAuditLogFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        value={filters.action ?? ""}
        onChange={(e) => update({ action: e.target.value || undefined })}
      >
        <option value="">All actions</option>
        {Object.values(EAuditAction).map((a) => (
          <option key={a} value={a}>
            {formatAction(a)}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        value={filters.actor_staff_id ?? ""}
        onChange={(e) => update({ actor_staff_id: e.target.value || undefined })}
      >
        <option value="">All actors</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label="From date"
        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        value={filters.created_from ? filters.created_from.slice(0, 10) : ""}
        onChange={(e) => update({ created_from: toIsoStart(e.target.value) })}
      />
      <input
        type="date"
        aria-label="To date"
        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        value={filters.created_to ? filters.created_to.slice(0, 10) : ""}
        onChange={(e) => update({ created_to: toIsoEnd(e.target.value) })}
      />
    </div>
  );
}
