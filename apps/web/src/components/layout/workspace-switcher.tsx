"use client";

import { useRouter } from "next/navigation";
import { Avatar as A } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Building06Icon, ArrowDown01Icon, Tick02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";

import { useWorkspace, useWorkspaces } from "@/hooks/auth/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceSwitcher({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const current = useWorkspace(workspaceSlug);
  const workspaces = useWorkspaces();

  const label = current.data?.name ?? workspaceSlug;
  const logoUrl = current.data?.logo_url;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch workspace"
        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-150 hover:bg-sidebar-accent/60 active:scale-[0.98]"
      >
        {/* Workspace logo — uploaded image if present, else a building icon. */}
        <A.Root className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">
          {logoUrl ? (
            <A.Image src={logoUrl} alt={label} className="size-full object-cover" />
          ) : null}
          <A.Fallback className="flex size-full items-center justify-center">
            <HugeiconsIcon icon={Building06Icon} className="size-4" />
          </A.Fallback>
        </A.Root>

        {current.isPending ? (
          <span className="h-4 w-24 animate-pulse rounded bg-sidebar-accent/60" />
        ) : (
          <span className="max-w-40 truncate text-sm font-semibold">{label}</span>
        )}

        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {workspaces.isPending ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : (
          (workspaces.data ?? []).map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onSelect={() => {
                if (ws.slug !== workspaceSlug) router.push(`/${ws.slug}`);
              }}
            >
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.slug === workspaceSlug ? (
                <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/create-workspace")}>
          <HugeiconsIcon icon={PlusSignIcon} className="size-4 text-muted-foreground" />
          <span className="flex-1">Create workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
