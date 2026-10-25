"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LayoutGridIcon,
  LeftToRightListBulletIcon,
  TableIcon,
  Delete02Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";

import {
  useCreateWorkspaceView,
  useDeleteWorkspaceView,
  useWorkspaceViews,
} from "@/hooks/workspace/use-workspace-views";
import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EViewLayout, type IWorkspaceView } from "@/types";

const LAYOUT_ICON = {
  [EViewLayout.Board]: LayoutGridIcon,
  [EViewLayout.List]: LeftToRightListBulletIcon,
  [EViewLayout.Table]: TableIcon,
};

function ViewRow({
  view,
  workspaceSlug,
}: {
  view: IWorkspaceView;
  workspaceSlug: string;
}) {
  const remove = useDeleteWorkspaceView(workspaceSlug);
  const Icon = LAYOUT_ICON[view.layout];

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <HugeiconsIcon icon={Icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{view.name}</h3>
        <p className="truncate text-xs text-muted-foreground">{view.description}</p>
        {view.filter_query ? (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{view.filter_query}</p>
        ) : null}
      </div>
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
    </div>
  );
}

export function WorkspaceViewsList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useWorkspaceViews(workspaceSlug);
  const create = useCreateWorkspaceView(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      layout: EViewLayout.List,
      filter_query: "status:in_progress",
    });
    setName("");
    setDescription("");
    setOpen(false);
  };

  return (
    <>
      <AppHeader
        actions={
          !isError ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              New view
            </Button>
          ) : undefined
        }
      />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load views"
            description="Something went wrong fetching workspace views."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : !data?.length ? (
          <EmptyState
            assetKey="generic"
            title="No workspace views"
            description="Save cross-project filters to revisit common slices of work."
            actions={[{ label: "Create view", onClick: () => setOpen(true) }]}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.map((view) => (
              <ViewRow key={view.id} view={view} workspaceSlug={workspaceSlug} />
            ))}
          </div>
        )}
      </ContentWrapper>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>New workspace view</DialogTitle>
          <DialogDescription>Saved filters across all projects in this workspace.</DialogDescription>
          <form onSubmit={onCreate} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label id="workspace-view-name-label" htmlFor="workspace-view-name">View name</Label>
              <input
                id="workspace-view-name"
                aria-labelledby="workspace-view-name-label"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="View name"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id="workspace-view-description-label" htmlFor="workspace-view-description">
                Description (optional)
              </Label>
              <input
                id="workspace-view-description"
                aria-labelledby="workspace-view-description-label"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
