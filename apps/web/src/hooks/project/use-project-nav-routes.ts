"use client";

import { useProject, useProjects } from "@/hooks/project/use-projects";
import { useSolutions } from "@/hooks/solution/use-solutions";
import { projectPanelRoutes, type IProjectPanelRoute } from "@/lib/nav/project-panel-routes";
import { resolveProjectSolutionKey } from "@/lib/solutions/container-adapter";
import { composeContainerNavigation } from "@/lib/solutions/compose-navigation";
import { findSolution } from "@/lib/solutions/registry";
import { SOLUTIONS_ENABLED } from "@/lib/solutions/solutions-flag";
import type { IProject } from "@/types";

/**
 * The project for Rail B chrome: the full record once fetched, else the row
 * already in the projects list cache — so a project switch doesn't flash a
 * skeleton or the wrong solution's rows. Chrome-only: editors must keep using
 * `useProject`, since a list row may omit fields they would autosave.
 */
export function useRailProject(workspaceSlug: string, projectId: string): IProject | undefined {
  const project = useProject(workspaceSlug, projectId);
  const projects = useProjects(workspaceSlug);
  return project.data ?? projects.data?.find((p) => p.id === projectId);
}

/**
 * Rail B rows for a container (GIN-447). Solution-driven when the platform is
 * on; falls back to the Software Delivery list while the registry loads so the
 * panel is never empty.
 */
export function useProjectNavRoutes(workspaceSlug: string, projectId: string): IProjectPanelRoute[] {
  const project = useRailProject(workspaceSlug, projectId);
  const solutions = useSolutions(workspaceSlug);

  if (!SOLUTIONS_ENABLED || !solutions.data || !project) {
    return projectPanelRoutes(workspaceSlug, projectId);
  }
  const solution = findSolution(solutions.data, resolveProjectSolutionKey(project));
  if (!solution) return projectPanelRoutes(workspaceSlug, projectId);
  return composeContainerNavigation(workspaceSlug, projectId, solution);
}
