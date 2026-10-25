"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { usePlatformUsers, useStaffMe } from "@/hooks/admin/use-admin";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { EPrivilege, type IPlatformUser, type IPlatformUserFilters } from "@/types";
import { cn } from "@/lib/utils";

import { SuspendUserDialog } from "./suspend-user-dialog";
import { UsersTable } from "./users-table";
import { UsersToolbar } from "./users-toolbar";

function UsersTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-border px-3 py-3 last:border-0">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-44 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsersPage() {
  const router = useRouter();
  const { data: me } = useStaffMe();
  const { setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(50);
  const [filters, setFilters] = useState<IPlatformUserFilters>({ status: "all" });
  const [suspendTarget, setSuspendTarget] = useState<IPlatformUser | null>(null);

  const queryFilters = { ...filters, ...pageFilters };
  const { data: page, isPending, error, refetch } = usePlatformUsers(queryFilters);

  const privileges = new Set(me?.privileges ?? []);
  const canSuspend = privileges.has(EPrivilege.UsersSuspend);

  const users = page?.items ?? [];
  const hasFilters = Boolean(filters.q) || (filters.status ?? "all") !== "all";

  const handleFiltersChange = (next: IPlatformUserFilters) => {
    resetPagination();
    setFilters(next);
  };

  return (
    <>
      <AdminHeader
        title="Users"
        actions={<UsersToolbar filters={filters} onFiltersChange={handleFiltersChange} />}
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className={cn("t-skel", !isPending && "is-revealed")}>
          <div className={cn("t-skel-skeleton", isPending && "is-pulsing")}>
            <UsersTableSkeleton />
          </div>
          <div className="t-skel-content">
            {error ? (
              <EmptyState
                assetKey="generic"
                title="Couldn't load users"
                description="Try again in a moment."
                actions={[{ label: "Retry", onClick: () => refetch() }]}
              />
            ) : users.length === 0 && !isPending ? (
              <EmptyState
                assetKey="generic"
                title={hasFilters ? "No users match" : "No users yet"}
                description={
                  hasFilters
                    ? "Try a different search or filter."
                    : "Platform users will appear here."
                }
                actions={
                  hasFilters
                    ? [{ label: "Clear filters", onClick: () => handleFiltersChange({ status: "all" }) }]
                    : undefined
                }
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
                <UsersTable
                  users={users}
                  canSuspend={canSuspend}
                  onSelect={(user) => router.push(`/admin/users/${user.id}`)}
                  onSuspend={setSuspendTarget}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {suspendTarget ? (
        <SuspendUserDialog
          user={suspendTarget}
          open={Boolean(suspendTarget)}
          onOpenChange={(open) => !open && setSuspendTarget(null)}
        />
      ) : null}
    </>
  );
}
