"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  StarIcon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  Copy01Icon,
  Delete02Icon,
  Share08Icon,
  Link01Icon,
  Globe02Icon,
  SquareLock02Icon,
} from "@hugeicons/core-free-icons";

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
import { publicDashboardUrl } from "@/lib/dashboards/public-link";
import { cn } from "@/lib/utils";
import { EDashboardVisibility, type IDashboard } from "@/types";
import {
  useDeleteDashboard,
  useDuplicateDashboard,
  useUpdateDashboard,
} from "@/hooks/workspace/use-dashboards";

import { DashboardFormDialog } from "./dashboard-form-dialog";
import { ShareDashboardDialog } from "./share-dashboard-dialog";

export function DashboardCard({
  dashboard,
  workspaceSlug,
}: {
  dashboard: IDashboard;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const update = useUpdateDashboard(workspaceSlug);
  const duplicate = useDuplicateDashboard(workspaceSlug);
  const remove = useDeleteDashboard(workspaceSlug);

  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const widgetCount = dashboard.config.widgets.length;
  const href = `/${workspaceSlug}/dashboards/${dashboard.id}`;
  const isPublic = dashboard.visibility === EDashboardVisibility.Public;

  const toggleFavorite = () =>
    update.mutate({
      dashboardId: dashboard.id,
      payload: { is_favorite: !dashboard.is_favorite },
    });

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(href);
        }}
        className="group flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={DashboardSquare01Icon} className="size-5" />
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={dashboard.is_favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={dashboard.is_favorite}
              disabled={update.isPending}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite();
              }}
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
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Dashboard actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HugeiconsIcon
                    icon={MoreVerticalIcon}
                    className="size-4 text-muted-foreground"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => duplicate.mutate(dashboard.id)}
                >
                  <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                  <HugeiconsIcon icon={Share08Icon} className="size-4" />
                  Share
                </DropdownMenuItem>
                {isPublic && dashboard.public_token ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      navigator.clipboard
                        .writeText(publicDashboardUrl(dashboard.public_token!))
                        .catch(() => setShareOpen(true))
                    }
                  >
                    <HugeiconsIcon icon={Link01Icon} className="size-4" />
                    Copy public link
                  </DropdownMenuItem>
                ) : null}
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
        </div>

        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{dashboard.name}</h3>
          <p className="mt-0.5 line-clamp-2 min-h-8 text-xs text-muted-foreground">
            {dashboard.description || "No description"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
              isPublic ? "bg-primary/10 text-primary" : "bg-muted",
            )}
          >
            <HugeiconsIcon
              icon={isPublic ? Globe02Icon : SquareLock02Icon}
              className="size-3"
            />
            {isPublic ? "Public" : "Private"}
          </span>
          <span>
            {widgetCount === 0
              ? "No widgets yet"
              : `${widgetCount} widget${widgetCount === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

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
                setConfirmOpen(false);
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
