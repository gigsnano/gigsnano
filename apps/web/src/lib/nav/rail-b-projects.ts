import type { IProject } from "@/types";

export interface IRailBProjectOptions {
  projects: IProject[];
  limitProjects: boolean;
  projectLimit: number;
  favorites: string[];
}

export interface IRailBProjectRow {
  project: IProject;
  favorite: boolean;
}

/**
 * Rows for the Rail B "Projects" section: favorites pinned first (project
 * order), then the rest — limited when the pref is on. Favorites never count
 * against the limit, and a favorite id with no matching project is ignored.
 */
export function railBProjectRows({
  projects,
  limitProjects,
  projectLimit,
  favorites,
}: IRailBProjectOptions): IRailBProjectRow[] {
  const favoriteSet = new Set(favorites);
  const pinned = projects.filter((p) => favoriteSet.has(p.id));
  const rest = projects.filter((p) => !favoriteSet.has(p.id));
  const shown = limitProjects ? rest.slice(0, projectLimit) : rest;
  return [
    ...pinned.map((project) => ({ project, favorite: true })),
    ...shown.map((project) => ({ project, favorite: false })),
  ];
}

/** Projects that belong in the extended flyout (not already a Rail B row). */
export function railBHiddenProjects(options: IRailBProjectOptions): IProject[] {
  const shown = new Set(railBProjectRows(options).map((row) => row.project.id));
  return options.projects.filter((p) => !shown.has(p.id));
}
