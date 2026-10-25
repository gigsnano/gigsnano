"use client";

import { type CSSProperties, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelRightCloseIcon } from "@hugeicons/core-free-icons";

import { StoryAssigneePicker, StoryStatusPicker } from "@/components/board";
import { IssueDetailQuickActions } from "@/components/issues/detail/header/quick-actions";
import { IssueDetailSidebar } from "@/components/issues/detail/layout/issue-detail-sidebar";
import { PriorityPicker } from "@/components/issues/shared/priority-picker";
import { StoryCode } from "@/components/issues/shared/story-code";
import { TypeGlyph } from "@/components/issues/shared/type-glyph";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useDelivery } from "@/hooks/codebase/use-delivery";
import { useStoryRuns } from "@/hooks/story/use-story-detail";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import type { IIssueNavigation } from "@/hooks/issues/use-issue-navigation";
import { useWorkItemTab } from "@/hooks/issues/use-work-item-tab";
import { runsTabBadge } from "@/lib/issues/agent-run-state";
import { deliveryTabBadge } from "@/lib/issues/delivery-summary";
import { workItemPrimaryAction } from "@/lib/issues/work-item-primary-action";
import { WORK_ITEM_TABS, type WorkItemTab } from "@/lib/issues/work-item-tabs";
import { cn } from "@/lib/utils";
import { useWorkItemPropertiesStore } from "@/store/ui/work-item-properties.store";
import type { IStory } from "@/types";

/**
 * Page shell for the redesigned work-item detail (GIN-479, slice 1 of GIN-477).
 *
 * Owns chrome and navigation only — every tab's content is passed in, so the
 * later slices fill panels without touching the shell. Three regions: a compact
 * sticky header, a sticky tab bar, and a canvas whose main column is the single
 * scroll region beside a collapsible ~320px properties drawer.
 *
 * The drawer is a grid track at `xl` and up so collapsing it hands the width
 * back to the reading column. Below `xl` there is no width to give, so it
 * becomes an overlay sheet with its own (unpersisted, default-closed) state —
 * the persisted collapse is a desktop layout preference, not a "this sheet was
 * open when you left" instruction.
 */
export function WorkItemShell({
  story,
  code,
  workspaceSlug,
  projectId,
  cycleId,
  panels,
  navigation,
  showProjectLink = false,
  onNavigate,
}: {
  story: IStory;
  code: string;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  panels: Record<WorkItemTab, ReactNode>;
  navigation?: IIssueNavigation;
  showProjectLink?: boolean;
  onNavigate?: (storyId: string) => void;
}) {
  const { tab, goToTab } = useWorkItemTab();
  const collapsed = useWorkItemPropertiesStore((s) => s.collapsed);
  const toggleCollapsed = useWorkItemPropertiesStore((s) => s.toggle);
  const sheetOpen = useWorkItemPropertiesStore((s) => s.sheetOpen);
  const setSheetOpen = useWorkItemPropertiesStore((s) => s.setSheetOpen);
  const openProperties = useWorkItemPropertiesStore((s) => s.open);

  const activeIndex = Math.max(
    0,
    WORK_ITEM_TABS.findIndex((t) => t.id === tab),
  );
  const { barRef, pillRef } = useSlidingTabs(activeIndex);

  // Meaningful values only — `Runs · 0` is noise dressed as information.
  const { data: runs, dataUpdatedAt } = useStoryRuns(workspaceSlug, projectId, story.id);
  const { data: delivery } = useDelivery(workspaceSlug, projectId, story.id);
  const badges: Partial<Record<WorkItemTab, string | null>> = {
    runs: runsTabBadge(runs, dataUpdatedAt),
    delivery: deliveryTabBadge(delivery),
  };

  const primary = workItemPrimaryAction(story);
  const properties = (
    <IssueDetailSidebar
      story={story}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      cycleId={cycleId}
      showProjectLink={showProjectLink}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* Header — 68px, inside the 64–72px band the spec asks for. */}
      <header className="flex h-[68px] shrink-0 items-center gap-2 border-b border-border/60 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {story.type ? <TypeGlyph type={story.type} /> : null}
          <StoryCode code={code} />
          <StoryStatusPicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            hideLabel
          />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {story.title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <StoryAssigneePicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            hideLabel
          />
          <PriorityPicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
          {primary ? (
            <Button
              size="sm"
              className="h-7 text-xs transition-transform duration-150 ease-out active:scale-[0.97]"
              onClick={() => {
                if (primary.kind === "tab") goToTab(primary.tab);
                else openProperties();
              }}
            >
              {primary.label}
            </Button>
          ) : null}
          <IssueDetailQuickActions
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            nav={
              navigation?.hasNavigation
                ? {
                    position: navigation.position,
                    total: navigation.total,
                    prevId: navigation.prevId,
                    nextId: navigation.nextId,
                  }
                : undefined
            }
            onNavigate={onNavigate}
          />
          {/* Two triggers rather than one that branches on a measured viewport:
              the inline drawer and the overlay sheet are different surfaces, and
              CSS already knows which one is on screen. */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden xl:inline-flex"
            aria-label={collapsed ? "Show properties" : "Hide properties"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <HugeiconsIcon icon={PanelRightCloseIcon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="xl:hidden"
            aria-label="Show properties"
            onClick={() => setSheetOpen(true)}
          >
            <HugeiconsIcon icon={PanelRightCloseIcon} className="size-4" />
          </Button>
        </div>
      </header>

      {/* Tab bar — 46px. Sliding pill only (250ms); the panel below crossfades. */}
      <nav
        ref={barRef}
        aria-label="Work item sections"
        className="relative flex h-[46px] shrink-0 items-center gap-1 border-b border-border/60 px-2 sm:px-4"
      >
        <span
          ref={pillRef}
          className="t-project-tab-pill pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary"
          aria-hidden
        />
        {WORK_ITEM_TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            data-tab-index={i}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => goToTab(t.id)}
            className={cn(
              "relative z-[1] rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
              t.id === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {badges[t.id] ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {badges[t.id]}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div
        className="work-item-canvas min-h-0 flex-1"
        style={{ "--wi-drawer": collapsed ? "0rem" : "20rem" } as CSSProperties}
      >
        <main className="min-h-0 overflow-y-auto">
          <div
            key={tab}
            // `animation-duration-*`, not `duration-*`: this is an animation, and
            // a bare `duration-` on an element with no transition reads as
            // `transition: all` to both the linter and the next person.
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:animation-duration-150"
          >
            {panels[tab]}
          </div>
        </main>

        <div className="hidden min-h-0 overflow-hidden xl:block">
          {collapsed ? null : properties}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="max-w-sm p-0">
          <SheetTitle className="sr-only">Properties</SheetTitle>
          {properties}
        </SheetContent>
      </Sheet>
    </div>
  );
}
