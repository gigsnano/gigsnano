import {
  DashboardSquare01Icon,
  Bug01Icon,
  Calendar03Icon,
  Layers01Icon,
  File01Icon,
  ShareKnowledgeIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface IProjectPanelRoute {
  label: string;
  path: string;
  icon: IconSvgElement;
  exact: boolean;
  /** Extra paths that also light this row — Overview owns its Journey/Views tabs. */
  activePrefixes?: string[];
}

/** Project segments rendered as Overview tabs instead of Rail B rows. */
export const OVERVIEW_TAB_SEGMENTS = ["journey", "views"] as const;

export function overviewActivePrefixes(base: string): string[] {
  return OVERVIEW_TAB_SEGMENTS.map((segment) => `${base}/${segment}`);
}

/**
 * Rail B rows for a Software Delivery project — the fallback when the solution
 * registry is off or not loaded. Setup pages (document import, repository,
 * foundation) live in project settings; Journey/Views are Overview tabs.
 */
export function projectPanelRoutes(workspaceSlug: string, projectId: string): IProjectPanelRoute[] {
  const base = `/${workspaceSlug}/projects/${projectId}`;
  return [
    {
      label: "Overview",
      path: base,
      icon: DashboardSquare01Icon,
      exact: true,
      activePrefixes: overviewActivePrefixes(base),
    },
    { label: "Work items", path: `${base}/issues`, icon: Bug01Icon, exact: false },
    { label: "Cycles", path: `${base}/cycles`, icon: Calendar03Icon, exact: false },
    { label: "Modules", path: `${base}/modules`, icon: Layers01Icon, exact: false },
    { label: "Pages", path: `${base}/pages`, icon: File01Icon, exact: false },
    { label: "Meetings", path: `${base}/meetings`, icon: Video01Icon, exact: false },
    { label: "Codebase", path: `${base}/codebase`, icon: ShareKnowledgeIcon, exact: false },
  ];
}

/** First path segment after `prefix`, or null. Replaces a `new RegExp` built from
 *  a dynamic slug (GIN-257): string ops can't ReDoS and treat the slug literally,
 *  so a slug with regex metacharacters can't misbehave. */
export function firstSegmentAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return pathname.slice(prefix.length).split("/")[0] || null;
}

/** Active dashboard project id from the URL, or null when not inside a project route. */
export function activeProjectIdFromPath(pathname: string, workspaceSlug: string): string | null {
  return firstSegmentAfter(pathname, `/${workspaceSlug}/projects/`);
}

export function isProjectPanelRouteActive(
  pathname: string,
  route: IProjectPanelRoute,
): boolean {
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  if (route.activePrefixes?.some(within)) return true;
  return route.exact ? pathname === route.path : within(route.path);
}
