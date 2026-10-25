"use client";

import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { useProjectFeatureFlags } from "@/hooks/project/use-project-settings";

export function FeatureDisabledGuard({
  workspaceSlug,
  projectId,
  feature,
  children,
}: {
  workspaceSlug: string;
  projectId: string;
  feature: "cycles" | "modules" | "views" | "pages";
  children: ReactNode;
}) {
  const flags = useProjectFeatureFlags(workspaceSlug, projectId);

  if (flags.isPending) {
    return <div className="m-6 h-32 animate-pulse rounded-lg border bg-muted" />;
  }

  if (!flags[feature]) {
    const labels = {
      cycles: "Cycles",
      modules: "Modules",
      views: "Views",
      pages: "Pages",
    };
    return (
      <div className="p-6">
        <EmptyState
          assetKey="generic"
          title={`${labels[feature]} disabled`}
          description={`Enable ${labels[feature].toLowerCase()} in project settings to use this page.`}
          actions={[
            {
              label: "Project settings",
              href: `/${workspaceSlug}/settings/projects/${projectId}/features`,
            },
            { label: "Back to project", href: `/${workspaceSlug}/projects/${projectId}` },
          ]}
        />
      </div>
    );
  }

  return children;
}
