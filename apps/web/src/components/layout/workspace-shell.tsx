"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelLeftOpenIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { maxWidth, minWidth } from "@/lib/layout/breakpoints";
import { useMediaQuery } from "@/hooks/ui/use-media-query";
import { usePanelStore } from "@/store/ui/panel.store";
import { useAiPaneStore } from "@/store/ui/ai-pane.store";
import { AppTopBar } from "./app-top-bar";
import { AppRail } from "./app-rail";
import { AppPanel } from "./app-panel";
import { ExtendedProjectSidebar } from "./panel/extended-project-sidebar";
import { AiPane } from "@/components/ai/ai-pane";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { DeleteWorkItemDialogHost } from "@/components/issues/shared/delete-work-item-dialog";

/**
 * Persistent workspace shell in Plane's "inner-card" layout:
 *  - AppTopBar (top) + AppRail (left) are the seamless dark frame (both
 *    `bg-sidebar`, no seam between them — a continuous ⌐-shaped chrome).
 *  - The inner card (panel + content) floats inside the frame: rounded, bordered,
 *    overflow-hidden, inset by a gap on the frame-facing edges (right + bottom),
 *    flush against the top bar and rail. It is NOT a full-height vertical split.
 *
 * Mounted once from [workspaceSlug]/layout.tsx so nothing remounts across
 * navigation. Panel width/collapse are driven by CSS vars/attrs on <html>
 * (seeded pre-paint by the no-flash script, synced here) — never React markup —
 * so there is no hydration mismatch and no layout-shift flash. The collapse/
 * resize grid lives on `.workspace-card` (panel · content); the rail sits
 * outside it.
 */
export function WorkspaceShell({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: ReactNode;
}) {
  const width = usePanelStore((s) => s.width);
  const collapsed = usePanelStore((s) => s.collapsed);
  const pathname = usePathname();
  const mobileOpen = usePanelStore((s) => s.mobileOpenAt) === pathname;
  const showPanel = usePanelStore((s) => s.showPanel);
  const closeMobile = usePanelStore((s) => s.closeMobile);
  const aiOpen = useAiPaneStore((s) => s.open);
  const aiExpanded = useAiPaneStore((s) => s.expanded);
  // Phones show GigsAI as a full-screen sheet; what it covers goes inert.
  const phone = useMediaQuery(maxWidth("md"));
  const covered = mobileOpen || (aiOpen && phone);

  useEffect(() => {
    const d = document.documentElement;
    d.style.setProperty("--panel-w", `${width}px`);
    d.setAttribute("data-panel-collapsed", collapsed ? "true" : "false");
    d.setAttribute("data-panel-mobile-open", mobileOpen ? "true" : "false");
  }, [width, collapsed, mobileOpen]);

  // Phone navigation sheet (Rail A + Rail B): move focus in, close on Escape, on
  // any sheet link (including one to the current page) and when the viewport
  // grows past the phone range. Everything behind it is inert while open.
  useEffect(() => {
    if (!mobileOpen) return;
    const rail = document.querySelector<HTMLElement>(".app-rail");
    const cell = document.querySelector<HTMLElement>(".workspace-panel-cell");
    cell?.querySelector<HTMLElement>("a[href], button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile();
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest("a[href]")) closeMobile();
    };
    const wide = window.matchMedia(minWidth("md"));
    const onWide = () => {
      if (wide.matches) closeMobile();
    };
    window.addEventListener("keydown", onKey);
    rail?.addEventListener("click", onClick);
    cell?.addEventListener("click", onClick);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      rail?.removeEventListener("click", onClick);
      cell?.removeEventListener("click", onClick);
      wide.removeEventListener("change", onWide);
      // Runs after the closing commit, once the top bar is no longer inert:
      // hand focus back to the menu button if it was inside the sheet.
      const active = document.activeElement;
      if (!active || active === document.body || rail?.contains(active) || cell?.contains(active)) {
        document.querySelector<HTMLElement>(".mobile-nav-btn")?.focus();
      }
    };
  }, [mobileOpen, closeMobile]);

  useEffect(() => {
    const d = document.documentElement;
    d.setAttribute("data-ai-open", aiOpen ? "true" : "false");
    // Grow the pane column when expanded; the content column is 1fr so it
    // flushes narrower on its own. Both the grid track and .ai-pane read --ai-w.
    d.style.setProperty("--ai-w", aiExpanded ? "min(62vw, 60rem)" : "400px");
  }, [aiOpen, aiExpanded]);

  return (
    <div className="flex h-dvh flex-col bg-muted text-sidebar-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <AppTopBar workspaceSlug={workspaceSlug} inert={covered} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Phone: rail + panel are the navigation sheet (globals.css). */}
        <AppRail workspaceSlug={workspaceSlug} />

        {/* Inset gap on the frame-facing edges (right + bottom); flush against
            the top bar (top) and rail (left). Phones run the card full-bleed. */}
        <div className="min-w-0 flex-1 pb-2 pr-2 max-md:p-0">
          <div className="workspace-card relative h-full w-full rounded-2xl border bg-background overflow-hidden max-md:rounded-none max-md:border-x-0 max-md:border-b-0">
            <div className="workspace-panel-cell relative h-full min-h-0 min-w-0 overflow-hidden">
              <AppPanel workspaceSlug={workspaceSlug} />
            </div>
            <button
              type="button"
              aria-label="Close panel"
              tabIndex={-1}
              onClick={closeMobile}
              className="panel-scrim absolute inset-0 z-30 bg-backdrop"
            />
            <main
              id="main-content"
              tabIndex={-1}
              inert={covered}
              className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl outline-none max-md:rounded-none"
            >
              <VerifyEmailBanner />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Expand panel"
                onClick={() => showPanel(pathname)}
                className="panel-expand-btn absolute left-2 top-2.5 z-20"
              >
                <HugeiconsIcon icon={PanelLeftOpenIcon} className="size-4" />
              </Button>
              {children}
            </main>
            {/* GigsAI pane — 3rd grid column; slides in from the right and
                flushes the content (secondary header included). */}
            <AiPane workspaceSlug={workspaceSlug} />
            <ExtendedProjectSidebar workspaceSlug={workspaceSlug} />
          </div>
        </div>
      </div>
      <DeleteWorkItemDialogHost />
    </div>
  );
}
