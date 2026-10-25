"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  useGrantStaff,
  useRevokeStaff,
  useStaffMe,
  useStaffRoles,
  useUpdateStaff,
} from "@/hooks/admin/use-admin";
import { EPrivilege, type IPlatformUserDetail, type IStaffRole } from "@/types";

export function UserDetailStaffTab({ user }: { user: IPlatformUserDetail }) {
  const { data: me } = useStaffMe();
  const { data: roles = [] } = useStaffRoles();
  const grantStaff = useGrantStaff();
  const updateStaff = useUpdateStaff();
  const revokeStaff = useRevokeStaff();
  const [grantRoleId, setGrantRoleId] = useState(roles[0]?.id ?? "");

  const canManage = new Set(me?.privileges ?? []).has(EPrivilege.StaffManage);

  const grantRoles: IStaffRole[] = [];
  for (const role of roles) {
    if (!role.is_system) grantRoles.push(role);
  }

  if (!canManage && !user.is_staff) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="Staff access"
        description="You don't have permission to manage platform staff."
      />
    );
  }

  if (user.is_staff && user.staff_member_id) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">
          This user is platform staff with the role below.
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Role</span>
          <select
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            value={user.staff_role_id ?? ""}
            disabled={!canManage || updateStaff.isPending}
            onChange={(e) =>
              updateStaff.mutate({
                memberId: user.staff_member_id!,
                payload: { role_id: e.target.value },
              })
            }
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={user.staff_is_active ?? false}
            disabled={!canManage || updateStaff.isPending}
            onChange={(e) =>
              updateStaff.mutate({
                memberId: user.staff_member_id!,
                payload: { is_active: e.target.checked },
              })
            }
          />
          Active staff member
        </label>
        {canManage ? (
          <Button
            variant="ghost"
            className="self-start text-destructive"
            disabled={revokeStaff.isPending}
            onClick={() => {
              if (window.confirm(`Revoke staff access for ${user.display_name}?`)) {
                revokeStaff.mutate(user.staff_member_id!);
              }
            }}
          >
            Revoke staff access
          </Button>
        ) : null}
      </div>
    );
  }

  if (!canManage) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="Not a staff member"
        description="This user does not have platform staff access."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Grant this user access to the platform admin console.
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Staff role</span>
        <select
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          value={grantRoleId}
          onChange={(e) => setGrantRoleId(e.target.value)}
        >
          {grantRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={!grantRoleId || grantStaff.isPending}
        className="self-start transition-transform duration-150 active:scale-[0.97]"
        onClick={() =>
          grantStaff.mutate({ user_id: user.id, role_id: grantRoleId })
        }
      >
        Grant staff access
      </Button>
    </div>
  );
}
