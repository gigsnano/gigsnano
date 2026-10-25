"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  StarIcon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  Copy01Icon,
  Delete02Icon,
  Share08Icon,
  GridViewIcon,
} from "@hugeicons/core-free-icons";

import { BROWSE_PARAM } from "@/lib/dashboards/auto-open";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { IDashboard } from "@/types";
import {
  useDashboard,
  useDeleteDashboard,
  useDuplicateDashboard,
  useUpdateDashboard,
} from "@/hooks/workspace/use-dashboards";
import { useWidgetGrid } from "@/hooks/workspace/use-widget-grid";
import { DashboardFilterProvider } from "@/hooks/workspace/use-dashboard-filter";

import { DashboardFormDialog } from "./dashboard-form-dialog";
import { ShareDashboardDialog } from "./share-dashboard-dialog";
import { WidgetGrid } from "./widgets/widget-grid";
import { DashboardToolbar } from "./widgets/dashboard-toolbar";
import { DashboardFilterBar } from "./filters/dashboard-filter-bar";

export function DashboardView({
  workspaceSlug,
  dashboardId,
}: {
  workspaceSlug: string;
  dashboardId: string;
}) {
  const router = useRouter();
  const { data: dashboard, isPending, refetch } = useDashboard(workspaceSlug, dashboardId);

  // The loaded board is split out and keyed by id: its widget state seeds once
  // from the server config, so switching dashboards must remount rather than
  // leave the previous board's widgets on screen.
  if (dashboard) {
    return (
      <DashboardBoard
        key={dashboard.id}
        dashboard={dashboard}
        workspaceSlug={workspaceSlug}
      />
    );
  }

  return (
    <>
      <AppHeader />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className="flex flex-col gap-4">
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-64 animate-pulse rounded-xl border bg-card" />
          </div>
        ) : (
          <EmptyState
            assetKey="error"
            title="Couldn't load dashboard"
            description="This dashboard may have been deleted, or something went wrong."
            actions={[
              { label: "Retry", onClick: () => refetch() },
              {
                label: "Back to dashboards",
                onClick: () => router.push(`/${workspaceSlug}/dashboards`),
              },
            ]}
          />
        )}
      </ContentWrapper>
    </>
  );
}

function DashboardBoard({
  dashboard,
  workspaceSlug,
}: {
  dashboard: IDashboard;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const grid = useWidgetGrid(dashboard, workspaceSlug);
  const update = useUpdateDashboard(workspaceSlug);
  const duplicate = useDuplicateDashboard(workspaceSlug);
  const remove = useDeleteDashboard(workspaceSlug);

  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const directoryHref = `/${workspaceSlug}/dashboards`;

  // Everything lives in the header: the breadcrumb already names the dashboard,
  // so a heading in the content would just repeat it.
  const actions = (
    <div className="flex items-center gap-1">
      <DashboardToolbar grid={grid} onResetRequest={() => setResetOpen(true)} />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={dashboard.is_favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={dashboard.is_favorite}
        disabled={update.isPending}
        onClick={() =>
          update.mutate({
            dashboardId: dashboard.id,
            payload: { is_favorite: !dashboard.is_favorite },
          })
        }
      >
        <HugeiconsIcon
          icon={StarIcon}
          className={cn(
            "size-4 transition-transform duration-200",
            dashboard.is_favorite
              ? "scale-110 fill-primary text-primary"
              : "text-muted-foreground",
          )}
        />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Dashboard actions">
            <HugeiconsIcon icon={MoreVerticalIcon} className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* With one dashboard, /dashboards redirects straight back here — this
              is the way to the directory (and to New dashboard) from inside it. */}
          <DropdownMenuItem
            onSelect={() => router.push(`/${workspaceSlug}/dashboards?${BROWSE_PARAM}=1`)}
          >
            <HugeiconsIcon icon={GridViewIcon} className="size-4" />
            All dashboards
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const copy = await duplicate.mutateAsync(dashboard.id);
              router.push(`/${workspaceSlug}/dashboards/${copy.id}`);
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShareOpen(true)}>
            <HugeiconsIcon icon={Share08Icon} className="size-4" />
            Share
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      <AppHeader actions={actions} />
      <ContentWrapper className="p-6">
        {grid.widgets.length > 0 ? (
          <DashboardFilterBar
            workspaceSlug={workspaceSlug}
            filters={grid.filters}
            onChange={grid.setFilters}
          />
        ) : null}
        <DashboardFilterProvider value={grid.filters}>
          <WidgetGrid grid={grid} workspaceSlug={workspaceSlug} />
        </DashboardFilterProvider>
      </ContentWrapper>

      <ShareDashboardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dashboard={dashboard}
        workspaceSlug={workspaceSlug}
      />

      <DashboardFormDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        mode="rename"
        initial={{ name: dashboard.name, description: dashboard.description }}
        onSubmit={async ({ name, description }) => {
          await update.mutateAsync({
            dashboardId: dashboard.id,
            payload: { name, description },
          });
        }}
      />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogTitle>Reset layout</DialogTitle>
          <DialogDescription>
            Re-arrange all widgets into the default grid at their default sizes. Your widgets
            and filters are kept — only positions and sizes change.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                grid.resetLayout();
                setResetOpen(false);
              }}
            >
              Reset layout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>Delete dashboard</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{dashboard.name}</span>? This
            can&apos;t be undone.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                await remove.mutateAsync(dashboard.id);
                router.push(directoryHref);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
