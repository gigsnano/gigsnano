"use client";

import { useState } from "react";

import {
  useCreateProjectState,
  useDeleteProjectState,
  useProjectStates,
} from "@/hooks/project/use-project-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { EStateGroup } from "@/types";

const GROUP_LABEL: Record<EStateGroup, string> = {
  [EStateGroup.Backlog]: "Backlog",
  [EStateGroup.Unstarted]: "Unstarted",
  [EStateGroup.Started]: "Started",
  [EStateGroup.Completed]: "Completed",
  [EStateGroup.Cancelled]: "Cancelled",
};

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProjectStatesSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useProjectStates(workspaceSlug, projectId);
  const create = useCreateProjectState(workspaceSlug, projectId);
  const remove = useDeleteProjectState(workspaceSlug, projectId);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<EStateGroup>(EStateGroup.Started);
  const [color, setColor] = useState("#3b82f6");

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color, group });
    setName("");
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-8 w-24" />
        </div>
        <ul className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
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
        title="Couldn't load states"
        description="Something went wrong."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const states = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onAdd} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Add workflow state</p>
        <div className="flex flex-col gap-1.5">
          <Label id="state-name-label" htmlFor="state-name">State name</Label>
          <input
            id="state-name"
            aria-labelledby="state-name-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="State name"
            className={field}
          />
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Group
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as EStateGroup)}
            className={field}
          >
            {Object.entries(GROUP_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <Label id="state-color-label" htmlFor="state-color">Color</Label>
          <input
            id="state-color"
            aria-labelledby="state-color-label"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-16 cursor-pointer rounded border bg-background"
          />
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add state"}
        </Button>
      </form>

      {states.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No custom states"
          description="Workflow states define how work moves on your boards."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {states.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{GROUP_LABEL[s.group]}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(s.id)}
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
