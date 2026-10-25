"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  useRevokeStaff,
  useStaffMembers,
  useStaffRoles,
  useUpdateStaff,
} from "@/hooks/admin/use-admin";

export function StaffMembersPanel({ canManage }: { canManage: boolean }) {
  const { data: members = [], isPending, error, refetch } = useStaffMembers();
  const { data: roles = [] } = useStaffRoles();
  const updateStaff = useUpdateStaff();
  const revokeStaff = useRevokeStaff();

  if (isPending) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }
  if (error) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="Couldn't load staff members"
        description="Try again in a moment."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }
  if (members.length === 0) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="No staff members yet"
        description="Grant a user staff access to see them here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Member</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium text-foreground">{m.display_name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </td>
              <td className="px-3 py-2">
                <select
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={m.role_id}
                  disabled={!canManage}
                  onChange={(e) =>
                    updateStaff.mutate({ memberId: m.id, payload: { role_id: e.target.value } })
                  }
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() =>
                    updateStaff.mutate({ memberId: m.id, payload: { is_active: !m.is_active } })
                  }
                  className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {m.is_active ? "Active" : "Inactive"}
                </button>
              </td>
              <td className="px-3 py-2 text-right">
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revokeStaff.isPending}
                    onClick={() => revokeStaff.mutate(m.id)}
                  >
                    Revoke
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
