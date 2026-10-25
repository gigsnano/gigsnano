"use client";

import { Fragment, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { usePlatformUserActivity } from "@/hooks/admin/use-admin";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";

import { formatAction } from "../audit/format-action";

export function UserDetailActivityTab({ userId }: { userId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { setOffset, pageFilters } = useOffsetPagination(25);
  const { data: page, isPending, error, refetch } = usePlatformUserActivity(userId, pageFilters);
  const logs = page?.items ?? [];

  if (isPending) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }
  if (error) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="Couldn't load activity"
        description="Try again in a moment."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }
  if (logs.length === 0) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="No activity yet"
        description="Staff actions targeting this user will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <OffsetPagination
          offset={page?.offset ?? 0}
          limit={page?.limit ?? pageFilters.limit ?? 25}
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
                  <td className="px-3 py-2">{log.actor_name}</td>
                  <td className="px-3 py-2">{formatAction(log.action)}</td>
                </tr>
                {openId === log.id && log.metadata ? (
                  <tr className="border-b border-border bg-muted/20">
                    <td colSpan={3} className="px-3 py-2">
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
  );
}
