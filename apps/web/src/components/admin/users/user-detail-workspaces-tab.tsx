"use client";

import { EmptyState } from "@/components/empty-state";
import { usePlatformUserWorkspaces } from "@/hooks/admin/use-admin";
import { WORKSPACE_ROLE_LABEL } from "@/constants/roles";
import type { EWorkspaceRole } from "@/types";

export function UserDetailWorkspacesTab({ userId }: { userId: string }) {
  const { data: workspaces = [], isPending, error, refetch } = usePlatformUserWorkspaces(userId);

  if (isPending) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }
  if (error) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="Couldn't load workspaces"
        description="Try again in a moment."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }
  if (workspaces.length === 0) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title="No workspace memberships"
        description="This user isn't a member of any workspace yet."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Workspace</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((ws) => (
            <tr key={ws.workspace_id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium text-foreground">{ws.workspace_name}</p>
                <p className="text-xs text-muted-foreground">{ws.workspace_slug}</p>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {WORKSPACE_ROLE_LABEL[ws.role as EWorkspaceRole] ?? ws.role}
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{ws.status}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(ws.joined_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
