import {
  EContainerLifecycle,
  ESolutionKey,
  type IProject,
  type ISolutionContainer,
} from "@/types";

/**
 * Compatibility adapter (GIN-443 / GIN-445).
 *
 * Existing `project` records stay the Software Delivery implementation of a
 * container — URLs, identifiers and ids are untouched. This reads one as the
 * container contract so platform code can be written against containers before
 * any physical migration happens.
 *
 * The read-through default is the whole point: a project row that predates the
 * solution model has no `solution_key`, and must resolve to Software Delivery
 * rather than failing or being treated as unknown.
 */

/** The solution a project belongs to, defaulting old rows to Software Delivery. */
export function resolveProjectSolutionKey(
  project: Pick<IProject, "solution_key">,
): ESolutionKey {
  return project.solution_key ?? ESolutionKey.SoftwareDelivery;
}

/** Version 0 marks "inferred by the adapter", not "created against v0". */
const INFERRED_SOLUTION_VERSION = 0;

export function containerFromProject(project: IProject): ISolutionContainer {
  return {
    id: project.id,
    workspace_slug: project.workspace_slug,
    solution_key: resolveProjectSolutionKey(project),
    solution_version: project.solution_version ?? INFERRED_SOLUTION_VERSION,
    display_name: project.name,
    lifecycle: EContainerLifecycle.Active,
    // Software-only settings stay in `configuration` so the container contract
    // itself never grows a `has_ui`/repository field that other solutions must
    // carry as null.
    configuration: {
      identifier: project.identifier,
      has_ui: project.has_ui,
      flow: project.flow,
      planning_method: project.planning_method,
      repo_full_name: project.repo_full_name,
    },
    feature_flags: [],
    domain_ref: { kind: "project", id: project.id },
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

/** True when the container was inferred from a pre-solution project row. */
export function isInferredContainer(container: ISolutionContainer): boolean {
  return container.solution_version === INFERRED_SOLUTION_VERSION;
}

/**
 * Expand/contract dual-read (GIN-445): fill in the Software Delivery default
 * on projects that predate the solution columns, so every client above the
 * service boundary sees a concrete key without waiting for the backfill job.
 * Idempotent — already-keyed rows pass through unchanged.
 */
export function normalizeProject(project: IProject): IProject {
  if (project.solution_key != null) return project;
  return {
    ...project,
    solution_key: ESolutionKey.SoftwareDelivery,
    solution_version: project.solution_version ?? INFERRED_SOLUTION_VERSION,
  };
}

export function normalizeProjects(projects: IProject[]): IProject[] {
  return projects.map(normalizeProject);
}
