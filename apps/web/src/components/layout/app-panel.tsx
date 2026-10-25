"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelLeftCloseIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { usePanelStore } from "@/store/ui/panel.store";
import { resolveActiveApp, APP_TITLE } from "@/lib/nav/workspace-nav";
import { activeProjectIdFromPath, firstSegmentAfter } from "@/lib/nav/project-panel-routes";
import { railBContext } from "@/lib/nav/rail-b-context";
import { WorkspacePanelNav } from "./panel/workspace-panel-nav";
import { ProjectPanelNav } from "./panel/project-panel-nav";
import { RailBContextSwitch } from "./panel/rail-b-context-switch";
import { DocsPanelNav } from "./panel/docs-panel-nav";
import { AgentsPanelNav } from "./panel/agents-panel-nav";
import { RoomsPanelNav } from "./panel/rooms-panel-nav";
import { SettingsPanelNav } from "./panel/settings-panel-nav";
import { ProjectSettingsNav } from "@/components/settings";
import { CustomizeNavDialog } from "./panel/customize-nav-dialog";

/** Rail width in px — the panel resize handle measures from here. Keep in sync
 *  with AppRail's `w-14`. */
const RAIL_WIDTH = 56;

export function AppPanel({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const activeApp = resolveActiveApp(pathname, workspaceSlug);
  const projectSettingsId = firstSegmentAfter(
    pathname,
    `/${workspaceSlug}/settings/projects/`,
  );
  const panelContext = railBContext(pathname, workspaceSlug);
  const activeProjectId = activeProjectIdFromPath(pathname, workspaceSlug);
  const hidePanel = usePanelStore((s) => s.hidePanel);
  const setWidth = usePanelStore((s) => s.setWidth);

  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const root = document.documentElement;
    root.classList.add("panel-resizing"); // disables the grid transition during drag
    // Capture the pointer so a release outside the viewport still delivers
    // pointerup (otherwise the resize class + listeners could be stranded).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const onMove = (ev: PointerEvent) => setWidth(ev.clientX - RAIL_WIDTH);
    const onUp = () => {
      root.classList.remove("panel-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside
      className="relative flex h-full flex-col border-r  text-foreground overflow-hidden"
      // --panel-sheet-w caps the width inside the phone navigation sheet.
      style={{ width: "var(--panel-sheet-w, var(--panel-w, 260px))" }}
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-3">
        <span className="truncate text-sm font-semibold">
          {APP_TITLE[activeApp]}
        </span>
        <div className="flex items-center gap-0.5">
          {activeApp === "workspace" && panelContext === "workspace" ? <CustomizeNavDialog /> : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse panel"
            onClick={hidePanel}
          >
            <HugeiconsIcon icon={PanelLeftCloseIcon} className="size-4" />
          </Button>
        </div>
      </header>

      {/* keyed by app → remounts and replays the cross-blur only on app switch,
          NOT on intra-app navigation (activeApp is stable within an app). */}
      <div
        key={activeApp}
        className="t-panel-body flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {activeApp === "workspace" && (
          <RailBContextSwitch context={panelContext}>
            {activeProjectId ? (
              <ProjectPanelNav workspaceSlug={workspaceSlug} projectId={activeProjectId} />
            ) : (
              <WorkspacePanelNav workspaceSlug={workspaceSlug} />
            )}
          </RailBContextSwitch>
        )}
        {activeApp === "docs" && <DocsPanelNav workspaceSlug={workspaceSlug} />}
        {activeApp === "agents" && (
          <AgentsPanelNav workspaceSlug={workspaceSlug} />
        )}
        {activeApp === "rooms" && <RoomsPanelNav workspaceSlug={workspaceSlug} />}
        {activeApp === "settings" && projectSettingsId ? (
          <ProjectSettingsNav
            workspaceSlug={workspaceSlug}
            projectId={projectSettingsId}
          />
        ) : null}
        {activeApp === "settings" && !projectSettingsId ? (
          <SettingsPanelNav workspaceSlug={workspaceSlug} />
        ) : null}
      </div>

      {/* Resize handle — inside the panel's right edge (right-0, not -right-1)
          so the collapse-clip on the parent cell doesn't eat the hit area.
          `group` + a hover tint on the inner bar gives a subtle affordance. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={onResizeStart}
        className="group absolute inset-y-0 right-0 z-10 flex w-1.5 cursor-col-resize justify-center max-md:hidden"
      >
        <span className="h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-sidebar-accent-foreground/30" />
      </div>
    </aside>
  );
}
