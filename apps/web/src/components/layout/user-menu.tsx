"use client";

import { useRouter } from "next/navigation";

import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon, UserIcon, UserSwitchIcon } from "@hugeicons/core-free-icons";

import { useAuthUser, useSignOut } from "@/hooks/auth/use-auth";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccountSettingsStore } from "@/store/ui/account-settings.store";

export function UserMenu() {
  const { data: user } = useAuthUser();
  const router = useRouter();
  const signOut = useSignOut();
  const openAccountSettings = useAccountSettingsStore((s) => s.openModal);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-sidebar-accent/60">
        <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
        <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">
          {user.display_name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openAccountSettings("profile")}>
          <HugeiconsIcon icon={UserIcon} className="size-4" />
          Account settings
        </DropdownMenuItem>
        {/* Routes rather than signing out: the sign-in endpoint replaces the
            session cookies, so backing out leaves the current one untouched. */}
        <DropdownMenuItem onSelect={() => router.push("/sign-in?switch=1")}>
          <HugeiconsIcon icon={UserSwitchIcon} className="size-4" />
          Switch account
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={signOut.isPending}
          onSelect={() => signOut.mutate()}
        >
          <HugeiconsIcon icon={Logout01Icon} className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
