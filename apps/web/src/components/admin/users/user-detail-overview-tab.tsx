"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EPrivilege, type IPlatformUserDetail } from "@/types";
import { useStaffMe } from "@/hooks/admin/use-admin";

import { SuspendUserDialog } from "./suspend-user-dialog";
import { UserProfileEditDialog } from "./user-profile-edit-dialog";

function authLabel(provider: IPlatformUserDetail["auth_provider"]): string {
  if (provider === "both") return "Google + password";
  if (provider === "google") return "Google";
  return "Password";
}

export function UserDetailOverviewTab({ user }: { user: IPlatformUserDetail }) {
  const { data: me } = useStaffMe();
  const privileges = new Set(me?.privileges ?? []);
  const canSuspend = privileges.has(EPrivilege.UsersSuspend);
  const canManage = privileges.has(EPrivilege.UsersManage);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-border p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Account
        </h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Auth</dt>
          <dd>{authLabel(user.auth_provider)}</dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
          {user.last_workspace_slug ? (
            <>
              <dt className="text-muted-foreground">Last workspace</dt>
              <dd>{user.last_workspace_slug}</dd>
            </>
          ) : null}
          {user.suspended_at ? (
            <>
              <dt className="text-muted-foreground">Suspended</dt>
              <dd>{new Date(user.suspended_at).toLocaleString()}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notifications
          </h4>
          {canManage ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email digest</dt>
          <dd>{user.email_digest ? "On" : "Off"}</dd>
          <dt className="text-muted-foreground">Product updates</dt>
          <dd>{user.product_updates ? "On" : "Off"}</dd>
        </dl>
      </section>

      {canSuspend ? (
        <Button
          variant={user.is_suspended ? "outline" : "destructive"}
          className="transition-transform duration-150 active:scale-[0.97]"
          onClick={() => setSuspendOpen(true)}
        >
          {user.is_suspended ? "Reinstate user" : "Suspend user"}
        </Button>
      ) : null}

      <SuspendUserDialog user={user} open={suspendOpen} onOpenChange={setSuspendOpen} />
      <UserProfileEditDialog user={user} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
