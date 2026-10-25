import type { IProjectView } from "@/types";

/** Resolve a saved view's detail page. */
export function viewHref(workspaceSlug: string, view: IProjectView): string {
  return `/${workspaceSlug}/projects/${view.project_id}/views/${view.id}`;
}
