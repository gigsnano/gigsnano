"use client";

import type { ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { useProject } from "@/hooks/project/use-projects";
import { firstSegmentAfter } from "@/lib/nav/project-panel-routes";
import { resolveProjectSolutionKey } from "@/lib/solutions/container-adapter";
import { authorizeContainerSegment } from "@/lib/solutions/compose-navigation";
import { SOLUTIONS_ENABLED } from "@/lib/solutions/solutions-flag";

/**
 * Route guard for a container shell (GIN-447).
 *
 * Resolves the project's solution (read-through defaulting to Software
 * Delivery) and blocks segments the solution does not own — before any
 * domain page tries to fetch data. Existing Software Delivery members keep
 * every current path; a Revenue Assurance deep link into `/repository` gets
 * a clear 403 instead of the software UI.
 */
export function SolutionContainerGate({
  segment: segmentOverride,
  children,
}: {
  /** Pages outside the project shell (settings → setup) name their segment explicitly. */
  segment?: string;
  children: ReactNode;
}) {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const pathname = usePathname();
  const workspaceSlug = params.workspaceSlug ?? "";
  const projectId = params.projectId ?? "";
  const project = useProject(workspaceSlug, projectId);

  if (!SOLUTIONS_ENABLED || !project.data) return children;

  const segment =
    segmentOverride ?? firstSegmentAfter(pathname, `/${workspaceSlug}/projects/${projectId}/`);
  const decision = authorizeContainerSegment(resolveProjectSolutionKey(project.data), segment);

  if (decision === "allow") return children;

  const home = `/${workspaceSlug}/projects/${projectId}`;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        assetKey="generic"
        title={decision === "forbid" ? "Not available in this solution" : "Page not found"}
        description={
          decision === "forbid"
            ? "This area belongs to a different solution. Go back to the container home to see what you can do here."
            : "That page isn't part of this container's navigation."
        }
        actions={[{ label: "Back to container", href: home }]}
      />
    </div>
  );
}
