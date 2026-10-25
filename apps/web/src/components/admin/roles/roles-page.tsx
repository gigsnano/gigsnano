"use client";

import { useState } from "react";

import { AdminHeader } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useCreateRole, useDeleteRole, useStaffMe, useStaffRoles } from "@/hooks/admin/use-admin";
import { EPrivilege } from "@/types";
import { cn } from "@/lib/utils";

import { RolePrivilegeEditor } from "./role-privilege-editor";
import { StaffMembersPanel } from "./staff-members-panel";

export function RolesPage() {
  const { data: me } = useStaffMe();
  const { data: roles = [], isPending, error, refetch } = useStaffRoles();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const privileges = new Set(me?.privileges ?? []);
  const canManageRoles = privileges.has(EPrivilege.RolesManage);
  const canManageStaff = privileges.has(EPrivilege.StaffManage);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];

  return (
    <>
      <AdminHeader
        title="Roles & Privileges"
        actions={
          canManageRoles ? (
            <Button
              size="sm"
              disabled={createRole.isPending}
              onClick={() => {
                const name = window.prompt("New role name");
                if (name?.trim()) createRole.mutate({ name: name.trim(), privileges: [] });
              }}
            >
              New role
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        {isPending ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : error ? (
          <EmptyState
            assetKey="generic"
            title="Couldn't load roles"
            description="Try again in a moment."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : (
          <div className="flex flex-col gap-8">
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
              <div className="flex flex-col gap-1">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      selected?.id === r.id && "bg-accent font-medium",
                    )}
                  >
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.member_count}</span>
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-border p-4">
                {selected ? (
                  <div className="flex flex-col gap-4">
                    <RolePrivilegeEditor
                      key={selected.id}
                      role={selected}
                      canManage={canManageRoles}
                    />
                    {canManageRoles && !selected.is_system && (
                      <div className="border-t border-border pt-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={selected.member_count > 0 || deleteRole.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete role "${selected.name}"?`)) {
                              deleteRole.mutate(selected.id);
                              setSelectedId(null);
                            }
                          }}
                        >
                          {selected.member_count > 0
                            ? "Reassign members before deleting"
                            : "Delete role"}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">Staff members</h2>
              <StaffMembersPanel canManage={canManageStaff} />
            </section>
          </div>
        )}
      </div>
    </>
  );
}
