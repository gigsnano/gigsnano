import { Suspense, type ReactNode } from "react";

import { IssuePeekSheet } from "@/components/issues/peek/issue-peek-sheet";
import { ProjectHeader } from "@/components/projects/project-header";
import { ProjectScrollRegion } from "@/components/projects/project-scroll-region";
import { SolutionContainerGate } from "@/components/solutions/solution-container-gate";

/**
 * Project detail shell. The header is mounted here so it persists across
 * Overview/Work items/Cycles/Modules/Views — only the scroll region below
 * swaps. Sub-route navigation lives in the Rail B "Projects" tree (Plane-style),
 * not a top tab bar. `SolutionContainerGate` (GIN-447) blocks segments the
 * container's solution does not own before any page fetches domain data.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ProjectHeader />
      <ProjectScrollRegion>
        <SolutionContainerGate>{children}</SolutionContainerGate>
      </ProjectScrollRegion>
      <Suspense fallback={null}>
        <IssuePeekSheet workspaceSlug={workspaceSlug} projectId={projectId} />
      </Suspense>
    </div>
  );
}
