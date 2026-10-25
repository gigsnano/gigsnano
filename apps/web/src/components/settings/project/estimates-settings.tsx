"use client";

import { useState } from "react";

import {
  useCreateProjectEstimate,
  useDeleteProjectEstimate,
  useProjectEstimates,
} from "@/hooks/project/use-project-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TYPE_LABEL = { points: "Story points", hours: "Hours", days: "Days" };

export function ProjectEstimatesSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useProjectEstimates(workspaceSlug, projectId);
  const create = useCreateProjectEstimate(workspaceSlug, projectId);
  const remove = useDeleteProjectEstimate(workspaceSlug, projectId);
  const [name, setName] = useState("");
  const [type, setType] = useState<"points" | "hours" | "days">("points");
  const [description, setDescription] = useState("");

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), type, description: description.trim() });
    setName("");
    setDescription("");
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-24" />
        </div>
        <ul className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
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
        title="Couldn't load estimates"
        description="Something went wrong."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const estimates = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onAdd} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Add estimate type</p>
        <div className="flex flex-col gap-1.5">
          <Label id="estimate-name-label" htmlFor="estimate-name">Name</Label>
          <input
            id="estimate-name"
            aria-labelledby="estimate-name-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="estimate-type-label" htmlFor="estimate-type">Type</Label>
          <select
            id="estimate-type"
            aria-labelledby="estimate-type-label"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className={field}
          >
            <option value="points">Story points</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="estimate-description-label" htmlFor="estimate-description">Description (optional)</Label>
          <input
            id="estimate-description"
            aria-labelledby="estimate-description-label"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className={field}
          />
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add estimate"}
        </Button>
      </form>

      {estimates.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No estimate types yet"
          description="Define how your team sizes work — points, hours, or days."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {estimates.map((est) => (
            <li key={est.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{est.name}</p>
                <p className="text-xs text-muted-foreground">
                  {TYPE_LABEL[est.type]}
                  {est.description ? ` · ${est.description}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(est.id)}
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
