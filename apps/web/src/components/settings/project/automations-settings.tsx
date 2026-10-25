"use client";

import { useState } from "react";

import {
  useCreateProjectAutomation,
  useDeleteProjectAutomation,
  useProjectAutomations,
} from "@/hooks/project/use-project-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProjectAutomationsSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useProjectAutomations(workspaceSlug, projectId);
  const create = useCreateProjectAutomation(workspaceSlug, projectId);
  const remove = useDeleteProjectAutomation(workspaceSlug, projectId);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [action, setAction] = useState("");

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !trigger.trim() || !action.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      trigger: trigger.trim(),
      action: action.trim(),
    });
    setName("");
    setTrigger("");
    setAction("");
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-28" />
        </div>
        <ul className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
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
        title="Couldn't load automations"
        description="Something went wrong."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const automations = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onAdd} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Add automation</p>
        <div className="flex flex-col gap-1.5">
          <Label id="automation-name-label" htmlFor="automation-name">Name</Label>
          <input
            id="automation-name"
            aria-labelledby="automation-name-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="automation-trigger-label" htmlFor="automation-trigger">When (trigger)</Label>
          <input
            id="automation-trigger"
            aria-labelledby="automation-trigger-label"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="When (trigger)"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="automation-action-label" htmlFor="automation-action">Then (action)</Label>
          <input
            id="automation-action"
            aria-labelledby="automation-action-label"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Then (action)"
            className={field}
          />
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add automation"}
        </Button>
      </form>

      {automations.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No automations yet"
          description="Automate status changes and notifications when events occur."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {automations.map((auto) => (
            <li key={auto.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{auto.name}</p>
                <p className="text-xs text-muted-foreground">
                  When {auto.trigger} → {auto.action}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {auto.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(auto.id)}
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
