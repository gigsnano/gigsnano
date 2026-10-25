"use client";

import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/workspace/use-notifications";
import { cn } from "@/lib/utils";
import { useAiPaneStore } from "@/store/ui/ai-pane.store";
import { usePanelStore } from "@/store/ui/panel.store";
import { NotificationWidget } from "@/components/notifications/notification-widget";
import { BalancePill } from "@/components/billing/balance-pill";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { WorkspaceSearch } from "./workspace-search";

/**
 * Full-width top bar. Together with AppRail it forms the seamless dark frame
 * (both `bg-sidebar`, no border between them): the top bar runs across the top,
 * the rail down the left — a continuous ⌐-shaped chrome. The inner card (panel +
 * content) floats inside this frame. Holds the workspace switcher (left) and
 * theme toggle (right); search / actions can slot in here later.
 */
export function AppTopBar({
  workspaceSlug,
  inert,
}: {
  workspaceSlug: string;
  /** True while the phone navigation sheet covers the shell. */
  inert?: boolean;
}) {
  const { data: unread } = useUnreadNotifications(workspaceSlug);

  return (
    <header
      inert={inert}
      className="flex h-12 shrink-0 items-center gap-3 bg-muted px-3 text-sidebar-foreground max-md:gap-1.5 max-md:pl-1.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:min-w-fit">
        <MobileNavButton />
        <WorkspaceSwitcher workspaceSlug={workspaceSlug} />
      </div>

      <WorkspaceSearch workspaceSlug={workspaceSlug} />

      <div className="flex flex-1 items-center justify-end gap-2 max-md:flex-none max-md:gap-1">
        <UserMenu />
        <NotificationWidget workspaceSlug={workspaceSlug} unreadCount={unread?.total_unread ?? 0} />
        {/* Phones: billing stays in settings, the theme toggle moves into the
            navigation sheet's rail. */}
        <div className="contents max-md:hidden">
          <BalancePill workspaceSlug={workspaceSlug} />
        </div>
        <GigsAiButton />
        <div className="contents max-md:hidden">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Phone-only: opens the navigation sheet (Rail A + the active Rail B panel). */
function MobileNavButton() {
  const pathname = usePathname();
  const open = usePanelStore((s) => s.mobileOpenAt) === pathname;
  const showPanel = usePanelStore((s) => s.showPanel);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Open navigation"
      aria-expanded={open}
      onClick={() => showPanel(pathname)}
      className="mobile-nav-btn shrink-0 md:hidden"
    >
      <HugeiconsIcon icon={Menu01Icon} className="size-5" />
    </Button>
  );
}

/** Toggles the right-side GigsAI pane. Shows an active/close state when open. */
function GigsAiButton() {
  const open = useAiPaneStore((s) => s.open);
  const toggle = useAiPaneStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      aria-label={open ? "Close GigsAI" : "Open GigsAI"}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors duration-150 active:scale-[0.97]",
        open
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <HugeiconsIcon icon={open ? Cancel01Icon : AiMagicIcon} className="size-4" />
      <span className="hidden sm:inline">GigsAI</span>
    </button>
  );
}
