"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  InformationCircleIcon,
  Target02Icon,
  Activity01Icon,
  UserMultipleIcon,
  PanelRightCloseIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { useOverviewPanelStore, type OverviewTab } from "@/store/ui/overview-panel.store";
import type { IProject } from "@/types";
import { ProjectStateTab } from "./rail-tabs/project-state-tab";
import { ProjectUpdatesTab } from "./rail-tabs/project-updates-tab";
import { ProjectActivityTab } from "./rail-tabs/project-activity-tab";
import { ProjectWorkloadTab } from "./rail-tabs/project-workload-tab";

const TABS: { id: OverviewTab; label: string; icon: IconSvgElement }[] = [
  { id: "state", label: "Project State", icon: InformationCircleIcon },
  { id: "updates", label: "Project Updates", icon: Target02Icon },
  { id: "activity", label: "Activity", icon: Activity01Icon },
  { id: "workload", label: "Workload", icon: UserMultipleIcon },
];

/**
 * The Overview's details: icon tabs + active content. `rail` is the collapsible
 * lg+ right column; `sheet` is the same content inside the below-lg sheet, which
 * owns its own close button.
 */
export function OverviewRail({
  workspaceSlug,
  projectId,
  project,
  variant = "rail",
}: {
  workspaceSlug: string;
  projectId: string;
  project: IProject;
  variant?: "rail" | "sheet";
}) {
  const tab = useOverviewPanelStore((s) => s.tab);
  const setTab = useOverviewPanelStore((s) => s.setTab);
  const setCollapsed = useOverviewPanelStore((s) => s.setCollapsed);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col",
        variant === "rail" ? "h-full w-[320px] border-l max-lg:hidden" : "min-h-0 w-full flex-1",
      )}
    >
      <header className={cn("flex h-12 items-center justify-between gap-1 border-b px-3", variant === "sheet" && "h-14 pr-12")}>
        <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-label={t.label}
              title={t.label}
              aria-pressed={t.id === tab}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-7 w-9 items-center justify-center rounded-md transition-colors",
                t.id === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={t.icon} className="size-4" />
            </button>
          ))}
        </div>
        {variant === "rail" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse panel"
            onClick={() => setCollapsed(true)}
          >
            <HugeiconsIcon icon={PanelRightCloseIcon} className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {variant === "sheet" ? (
          <SheetTitle className="mb-3">{active.label}</SheetTitle>
        ) : (
          <h3 className="mb-3 text-sm font-semibold text-foreground">{active.label}</h3>
        )}
        {tab === "state" && (
          <ProjectStateTab
            project={project}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
        )}
        {tab === "updates" && <ProjectUpdatesTab />}
        {tab === "activity" && (
          <ProjectActivityTab workspaceSlug={workspaceSlug} projectId={projectId} />
        )}
        {tab === "workload" && (
          <ProjectWorkloadTab workspaceSlug={workspaceSlug} projectId={projectId} />
        )}
      </div>
    </aside>
  );
}
