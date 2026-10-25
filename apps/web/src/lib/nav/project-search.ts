import type { IProject } from "@/types";

/** Client filter for the extended project sidebar search field. */
export function filterProjectsByQuery(projects: IProject[], query: string): IProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter(
    (p) => p.name.toLowerCase().includes(q) || p.identifier.toLowerCase().includes(q),
  );
}
