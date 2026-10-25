"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LayoutGridIcon,
  LeftToRightListBulletIcon,
  TableIcon,
  Delete02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";

import { useAuthUser } from "@/hooks/auth/use-auth";
import { useDeleteView, useProjectViews, useToggleViewFavorite } from "@/hooks/project/use-views";
import { useProjectFeatureFlags } from "@/hooks/project/use-project-settings";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { relativeTime } from "@/lib/format/relative-time";
import { viewHref } from "@/lib/nav/view-url";
import { cn } from "@/lib/utils";
import { isViewOwner, shareScopeLabel } from "@/lib/views/view-sharing";
import { EViewLayout, type IProjectView } from "@/types";

import { EditViewDialog } from "./edit-view-dialog";

const LAYOUT_ICON = {
  [EViewLayout.Board]: LayoutGridIcon,
  [EViewLayout.List]: LeftToRightListBulletIcon,
  [EViewLayout.Table]: TableIcon,
};

function ViewRow({
  view,
  workspaceSlug,
  projectId,
  currentUserId,
}: {
  view: IProjectView;
  workspaceSlug: string;
  projectId: string;
  currentUserId: string | undefined;
}) {
  const remove = useDeleteView(workspaceSlug, projectId);
  const favorite = useToggleViewFavorite(workspaceSlug, projectId);
  const owner = isViewOwner(view, currentUserId);
  const Icon = LAYOUT_ICON[view.layout];

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <HugeiconsIcon icon={Icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{view.name}</h3>
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {shareScopeLabel(view.share_scope)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{view.description}</p>
        {view.filter_query ? (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{view.filter_query}</p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {view.owner_name} · Updated {relativeTime(view.updated_at)}
        </p>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={view.is_favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={view.is_favorite}
        disabled={favorite.isPending}
        onClick={() => favorite.mutate(view.id)}
      >
        <HugeiconsIcon
          icon={StarIcon}
          className={cn(
            "size-4 transition-transform duration-200",
            view.is_favorite ? "scale-110 fill-primary text-primary" : "text-muted-foreground",
          )}
        />
      </Button>
      <Link
        href={viewHref(workspaceSlug, view)}
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        Open
      </Link>
      {owner ? (
        <>
          <EditViewDialog view={view} workspaceSlug={workspaceSlug} projectId={projectId} />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Delete view"
            disabled={remove.isPending}
            onClick={() => remove.mutate(view.id)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4 text-muted-foreground" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function ProjectViewsList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: user } = useAuthUser();
  const { views: viewsEnabled, isPending: flagsPending } = useProjectFeatureFlags(
    workspaceSlug,
    projectId,
  );
  const { data, isPending, isError, refetch } = useProjectViews(workspaceSlug, projectId);

  if (!flagsPending && !viewsEnabled) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="generic"
          title="Views are disabled"
          description="Turn on Views in project settings to create saved board, list, and table filters."
          actions={[
            {
              label: "Project settings",
              href: `/${workspaceSlug}/settings/projects/${projectId}/features`,
            },
          ]}
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonReveal
            key={i}
            isLoading
            className="h-16"
            skeleton={<div className="size-full rounded-lg border bg-card" />}
          >
            <div />
          </SkeletonReveal>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load views"
          description="Something went wrong fetching saved views."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {!data?.length ? (
        <EmptyState
          assetKey="generic"
          title="No saved views"
          description="Create custom board, list, or table views to filter and organize work."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((view) => (
            <ViewRow
              key={view.id}
              view={view}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              currentUserId={user?.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
