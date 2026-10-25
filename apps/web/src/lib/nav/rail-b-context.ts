import { activeProjectIdFromPath, firstSegmentAfter } from "@/lib/nav/project-panel-routes";
import { authorizeContainerSegment } from "@/lib/solutions/compose-navigation";
import type { ESolutionKey } from "@/types";

/** Which panel Rail B shows: the workspace nav, or one project's nav (drill-in). */
export type RailBContext = "workspace" | "project";

export type RailBSwapDirection = "forward" | "back";

export function railBContext(pathname: string, workspaceSlug: string): RailBContext {
  return activeProjectIdFromPath(pathname, workspaceSlug) ? "project" : "workspace";
}

/** Enter direction for the panel swap; null when the context did not change. */
export function railBSwapDirection(
  prev: RailBContext,
  next: RailBContext,
): RailBSwapDirection | null {
  if (prev === next) return null;
  return next === "project" ? "forward" : "back";
}

/**
 * Where the project switcher sends you: the same section in the target project
 * (`/p1/issues/42` → `/p2/issues`), never a detail id that belongs to the source.
 * When the target's solution is known, a section it does not own falls back to
 * the target's home instead of a 403/404.
 */
export function switchProjectHref(
  pathname: string,
  workspaceSlug: string,
  fromId: string,
  toId: string,
  targetSolutionKey?: ESolutionKey,
): string {
  const target = `/${workspaceSlug}/projects/${toId}`;
  const section = firstSegmentAfter(pathname, `/${workspaceSlug}/projects/${fromId}/`);
  if (!section) return target;
  if (targetSolutionKey && authorizeContainerSegment(targetSolutionKey, section) !== "allow") {
    return target;
  }
  return `${target}/${section}`;
}
