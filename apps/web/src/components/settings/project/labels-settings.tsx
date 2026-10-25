"use client";

import { useState } from "react";

import {
  useCreateProjectLabel,
  useDeleteProjectLabel,
  useProjectLabels,
} from "@/hooks/project/use-project-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const PRESET_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#64748b"];

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProjectLabelsSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useProjectLabels(workspaceSlug, projectId);
  const create = useCreateProjectLabel(workspaceSlug, projectId);
  const remove = useDeleteProjectLabel(workspaceSlug, projectId);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    setName("");
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <Skeleton key={c} className="size-7 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <ul className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-8 w-16" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load labels"
        description="Something went wrong."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const labels = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onAdd} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Add label</p>
        <div className="flex flex-col gap-1.5">
          <Label id="label-name-label" htmlFor="label-name">Label name</Label>
          <input
            id="label-name"
            aria-labelledby="label-name-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Label name"
            className={field}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className="size-7 rounded-full ring-offset-2 transition-transform active:scale-95"
              style={{
                backgroundColor: c,
                outline: color === c ? `2px solid ${c}` : undefined,
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add label"}
        </Button>
      </form>

      {labels.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No labels yet"
          description="Labels help categorize stories on boards and in filters."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {labels.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-sm font-medium">{l.name}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(l.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
