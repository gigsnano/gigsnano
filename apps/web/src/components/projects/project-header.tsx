"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";

import { AppHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { CodebaseContextHeader } from "@/components/codebase/intelligence/codebase-context-header";
import { IssuesToolbar } from "@/components/issues/issues-toolbar";
import { IssueDetailHeaderActions } from "@/components/issues/detail/header/issue-detail-header-actions";
import { WORK_ITEM_DETAIL_V2 } from "@/lib/issues/work-item-detail-flag";
import { CreateCycleDialog } from "@/components/cycles/create-cycle-dialog";
import { CycleDetailToolbar } from "@/components/cycles/cycle-detail-toolbar";
import { CreateModuleDialog } from "@/components/modules/create-module-dialog";
import { CreateViewDialog } from "@/components/views/create-view-dialog";
import { CreatePageDialog } from "@/components/pages/create-page-dialog";
import { SendNotetakerDialog } from "@/components/meetings/send-notetaker-dialog";

import { JourneyProgressControl } from "@/components/journey";
import { JOURNEY_ENABLED } from "@/lib/journey/journey-flag";

import { ConnectGitHubDialog } from "./github/connect-github-dialog";
import { OverviewTabs } from "./overview/overview-tabs";

export function ProjectHeader() {
  const { workspaceSlug, projectId, cycleId } = useParams<{
    workspaceSlug: string;
    projectId: string;
    cycleId?: string;
  }>();
  const pathname = usePathname();
  const base = `/${workspaceSlug}/projects/${projectId}`;

  // Work Items list owns the secondary nav toolbar.
  const isIssueDetail =
    pathname.startsWith(`${base}/issues/`) && pathname !== `${base}/issues`;

  if (isIssueDetail) {
    // The redesigned detail page carries its own compact header with the single
    // primary CTA and one `•••` (GIN-479). Repeating Subscribe/⋯/agent controls
    // up here is exactly the "three competing action zones" it removes, so the
    // app header falls back to breadcrumbs only.
    if (WORK_ITEM_DETAIL_V2) return <AppHeader />;

    const storyId = pathname.slice(`${base}/issues/`.length).split("/")[0];
    if (storyId) {
      return (
        <AppHeader
          actions={
            <IssueDetailHeaderActions
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              storyId={storyId}
            />
          }
        />
      );
    }
  }

  if (pathname === `${base}/issues`) {
    return (
      <AppHeader
        actions={<IssuesToolbar workspaceSlug={workspaceSlug} projectId={projectId} />}
      />
    );
  }

  // Cycles list owns an "Add cycle" action.
  if (pathname === `${base}/cycles`) {
    return (
      <AppHeader
        actions={<CreateCycleDialog workspaceSlug={workspaceSlug} projectId={projectId} />}
      />
    );
  }

  // The cycle detail route owns its own secondary nav — view switcher + Add
  // work item, matching the Work Items pattern (no Connect GitHub / Settings).
  if (cycleId && pathname.startsWith(`${base}/cycles/`)) {
    return (
      <AppHeader
        actions={
          <CycleDetailToolbar
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
        }
      />
    );
  }

  // Modules list owns a "New module" primary action in the secondary header.
  if (pathname === `${base}/modules`) {
    return (
      <AppHeader
        actions={<CreateModuleDialog workspaceSlug={workspaceSlug} projectId={projectId} />}
      />
    );
  }

  // Pages list owns a "New page" primary action in the secondary header.
  if (pathname === `${base}/pages`) {
    return (
      <AppHeader
        actions={<CreatePageDialog workspaceSlug={workspaceSlug} projectId={projectId} />}
      />
    );
  }

  // Meetings list owns a "Send notetaker" primary action in the secondary header.
  if (pathname === `${base}/meetings`) {
    return (
      <AppHeader
        actions={<SendNotetakerDialog workspaceSlug={workspaceSlug} projectId={projectId} />}
      />
    );
  }

  // Codebase Intelligence replaces the generic breadcrumb bar with its own
  // consolidated context header (GIN-273): back-context + title + repo/index meta +
  // actions + attached view tabs, so only the global bar and this header sit beneath
  // browser chrome — no separate breadcrumb / repo-metadata / tab bands.
  if (pathname === `${base}/codebase`) {
    return <CodebaseContextHeader workspaceSlug={workspaceSlug} projectId={projectId} />;
  }

  // Overview · Journey · Views share one header shape: the right-aligned tabs keep
  // the same trailing controls on all three roots, so they never shift sideways.
  // A tab's own primary action ("New view") sits to the LEFT of the tabs.
  return (
    <AppHeader
      actions={
        <div className="flex items-center gap-2">
          {pathname === `${base}/views` ? (
            <CreateViewDialog workspaceSlug={workspaceSlug} projectId={projectId} />
          ) : null}
          <OverviewTabs workspaceSlug={workspaceSlug} projectId={projectId} />
          {JOURNEY_ENABLED ? (
            <JourneyProgressControl workspaceSlug={workspaceSlug} projectId={projectId} />
          ) : null}
          <ConnectGitHubDialog />
          <Button asChild size="sm" variant="secondary">
            <Link href={`${base}/settings`}>
              <HugeiconsIcon icon={Settings01Icon} className="size-4" />
              Settings
            </Link>
          </Button>
        </div>
      }
    />
  );
}
