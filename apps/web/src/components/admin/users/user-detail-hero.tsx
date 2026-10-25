"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { Avatar } from "@/components/ui/avatar";
import type { IPlatformUserDetail } from "@/types";
import { cn } from "@/lib/utils";

export function UserDetailHero({ user }: { user: IPlatformUserDetail }) {
  return (
    <div className="flex items-start gap-4 border-b border-border px-6 py-5">
      <Avatar name={user.display_name} src={user.avatar_url} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-foreground">{user.display_name}</h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              user.is_suspended
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {user.is_suspended ? "Suspended" : "Active"}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        {user.is_suspended && user.last_suspend_reason ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Reason: {user.last_suspend_reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function UserDetailBackLink() {
  return (
    <Link
      href="/admin/users"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97]"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
      All users
    </Link>
  );
}
