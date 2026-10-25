"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { useCreateSticky, useStickies } from "@/hooks/workspace/use-stickies";
import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

import { STICKY_COLORS } from "./sticky-colors";
import { StickyNote } from "./sticky-note";

const GRID = "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function StickiesBoard({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useStickies(workspaceSlug);
  const create = useCreateSticky(workspaceSlug);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const stickies = data ?? [];
  const hasStickies = !isPending && !isError && stickies.length > 0;

  const addSticky = () => {
    const color = STICKY_COLORS[stickies.length % STICKY_COLORS.length].value;
    create.mutate(
      { body: "", color },
      { onSuccess: (created) => setJustAdded(created.id) },
    );
  };

  return (
    <>
      <AppHeader
        actions={
          hasStickies ? (
            <Button size="sm" onClick={addSticky} disabled={create.isPending}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              Add sticky
            </Button>
          ) : undefined
        }
      />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className={GRID}>
            {Array.from({ length: 4 }).map((_, i) => (
              <StickyNoteSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load stickies"
            description="Something went wrong fetching your notes."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : stickies.length === 0 ? (
          <EmptyState
            assetKey="generic"
            title="No stickies yet"
            description="Jot down reminders and team notes — colorful, always-visible, and yours to arrange."
            actions={[{ label: "Add sticky", onClick: addSticky }]}
          />
        ) : (
          <div className={GRID}>
            {stickies.map((sticky, i) => (
              <StickyNote
                key={sticky.id}
                sticky={sticky}
                workspaceSlug={workspaceSlug}
                index={i}
                autoFocus={sticky.id === justAdded}
              />
            ))}
          </div>
        )}
      </ContentWrapper>
    </>
  );
}

/** Skeleton shaped exactly like a sticky note (body lines + bottom toolbar). */
function StickyNoteSkeleton() {
  return (
    <div className="flex min-h-[220px] flex-col rounded-2xl border bg-card p-4">
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="size-7 animate-pulse rounded-md bg-muted" />
        <div className="size-7 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
