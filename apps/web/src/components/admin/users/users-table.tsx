"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IPlatformUser } from "@/types";
import { cn } from "@/lib/utils";

function authLabel(provider: IPlatformUser["auth_provider"]): string {
  if (provider === "both") return "Google + password";
  if (provider === "google") return "Google";
  return "Password";
}

export function UsersTable({
  users,
  canSuspend,
  onSelect,
  onSuspend,
}: {
  users: IPlatformUser[];
  canSuspend: boolean;
  onSelect: (user: IPlatformUser) => void;
  onSuspend: (user: IPlatformUser) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Workspaces</th>
            <th className="px-3 py-2 font-medium">Auth</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 w-10">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="cursor-pointer border-b border-border last:border-0 transition-[background-color] duration-150 hover:bg-accent/50"
              onClick={() => onSelect(user)}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{user.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{user.workspace_count}</td>
              <td className="px-3 py-2 text-muted-foreground">{authLabel(user.auth_provider)}</td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    user.is_suspended
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  )}
                  title={user.is_suspended && user.suspended_at ? `Since ${new Date(user.suspended_at).toLocaleString()}` : undefined}
                >
                  {user.is_suspended ? "Suspended" : "Active"}
                </span>
              </td>
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                {canSuspend ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97]"
                      aria-label={`Actions for ${user.display_name}`}
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onSelect(user)}>
                        View details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={user.is_suspended ? undefined : "text-destructive focus:text-destructive"}
                        onSelect={() => onSuspend(user)}
                      >
                        {user.is_suspended ? "Reinstate user" : "Suspend user"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
