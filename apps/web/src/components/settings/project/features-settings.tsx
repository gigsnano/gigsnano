"use client";

import { useProjectFeatures, useUpdateProjectFeature } from "@/hooks/project/use-project-settings";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export function ProjectFeaturesSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useProjectFeatures(workspaceSlug, projectId);
  const update = useUpdateProjectFeature(workspaceSlug, projectId);

  if (isPending) {
    return (
      <ul className="divide-y rounded-lg border">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-start justify-between gap-4 px-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load features"
        description="Something went wrong."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const features = data ?? [];

  return (
    <ul className="divide-y rounded-lg border">
      {features.map((f) => (
        <li key={f.id} className="flex items-start justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-sm font-medium">{f.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
          </div>
          <Switch
            checked={f.enabled}
            disabled={update.isPending}
            aria-label={`Enable ${f.name}`}
            onCheckedChange={(enabled) => update.mutate({ featureId: f.id, enabled })}
          />
        </li>
      ))}
    </ul>
  );
}
