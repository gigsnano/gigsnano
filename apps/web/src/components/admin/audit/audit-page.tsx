"use client";

import { Fragment, useState } from "react";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { useAuditLogs } from "@/hooks/admin/use-admin";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import type { IAuditLogFilters } from "@/types";

import { AuditFilters } from "./audit-filters";
import { formatAction } from "./format-action";

export function AuditPage() {
  const { setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(50);
  const [filters, setFilters] = useState<IAuditLogFilters>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const queryFilters = { ...filters, ...pageFilters };
  const { data: page, isPending, error, refetch } = useAuditLogs(queryFilters);
  const logs = page?.items ?? [];

  const handleFiltersChange = (next: IAuditLogFilters) => {
    resetPagination();
    setFilters(next);
  };

  return (
    <>
      <AdminHeader
        title="Audit Log"
        actions={<AuditFilters filters={filters} onFiltersChange={handleFiltersChange} />}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {isPending ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : error ? (
          <EmptyState
            assetKey="generic"
            title="Couldn't load the audit log"
            description="Try again in a moment."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : logs.length === 0 ? (
          <EmptyState
            assetKey="generic"
            title="No audit events"
            description="Staff actions will appear here as they happen."
            actions={[{ label: "Retry", onClick: () => refetch(), variant: "outline" }]}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <OffsetPagination
                offset={page?.offset ?? 0}
                limit={page?.limit ?? pageFilters.limit ?? 50}
                total={page?.total ?? 0}
                onOffsetChange={setOffset}
              />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50"
                        onClick={() => setOpenId(openId === log.id ? null : log.id)}
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-foreground">{log.actor_name}</td>
                        <td className="px-3 py-2 text-foreground">{formatAction(log.action)}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {log.target_type ? `${log.target_type}${log.target_id ? ` · ${log.target_id}` : ""}` : "—"}
                        </td>
                      </tr>
                      {openId === log.id && log.metadata ? (
                        <tr className="border-b border-border bg-muted/20">
                          <td colSpan={4} className="px-3 py-2">
                            <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs text-muted-foreground">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
