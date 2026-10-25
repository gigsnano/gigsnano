"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand";
import { WORKSPACE_APPS, resolveActiveApp } from "@/lib/nav/workspace-nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * Primary app rail (Rail A). Together with AppTopBar it forms the seamless dark
 * frame (both `bg-sidebar`, no border between) — the card floats inside. No
 * border-r: the inner card's own border provides the seam. Switches the
 * workspace's top-level apps; mounted once from WorkspaceShell so it never
 * remounts across navigation.
 */
export function AppRail({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}`;
  const activeApp = resolveActiveApp(pathname, workspaceSlug);

  return (
    // `app-rail`: on phones the rail is the left half of the navigation sheet
    // (globals.css).
    <nav
      aria-label="Apps"
      className="app-rail flex h-full w-14 shrink-0 flex-col items-center bg-muted py-2 text-sidebar-foreground"
    >
      <Link
        href={base}
        aria-label="GigsNano home"
        className="mb-2 flex size-9 items-center justify-center rounded-md transition-transform duration-150 active:scale-95"
      >
        <BrandLogo variant="icon" className="size-7" priority />
      </Link>
      <div className="flex flex-1 flex-col items-center gap-1 self-stretch px-1">
        {WORKSPACE_APPS.map((app) => (
          <RailItem
            key={app.id}
            href={`${base}${app.path}`}
            label={app.label}
            icon={app.icon}
            active={activeApp === app.id}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 self-stretch px-1">
        <RailItem
          href={`${base}/settings`}
          label="Settings"
          icon={Settings01Icon}
          active={activeApp === "settings"}
        />
        {/* Phones have no room for the theme toggle in the top bar. */}
        <div className="mt-1 md:hidden">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

function RailItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconSvgElement;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "group flex w-full flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium transition-transform duration-150 active:scale-95",
        active
          ? "text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-sidebar-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-md transition-colors duration-150",
          active ? "bg-sidebar-accent" : "group-hover:bg-sidebar-accent/60",
        )}
      >
        <HugeiconsIcon icon={icon} className="size-[18px]" />
      </span>
      {label}
    </Link>
  );
}
