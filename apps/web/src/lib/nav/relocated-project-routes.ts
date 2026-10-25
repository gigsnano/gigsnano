/**
 * Project setup pages that moved from the project shell into project settings
 * (Rail B drill-in, 2026-09-24). Imported by next.config.ts, so keep this file
 * free of `@/` aliases and runtime dependencies.
 */
export const RELOCATED_PROJECT_SEGMENTS = ["document-import", "repository", "foundation"] as const;

export type RelocatedProjectSegment = (typeof RELOCATED_PROJECT_SEGMENTS)[number];

export function projectSetupPath(
  workspaceSlug: string,
  projectId: string,
  segment: RelocatedProjectSegment,
): string {
  return `/${workspaceSlug}/settings/projects/${projectId}/${segment}`;
}

/** Old bookmarks keep working. Non-permanent so the move stays reversible. */
export function relocatedProjectRedirects() {
  return RELOCATED_PROJECT_SEGMENTS.map((segment) => ({
    source: `/:workspaceSlug/projects/:projectId/${segment}`,
    destination: `/:workspaceSlug/settings/projects/:projectId/${segment}`,
    permanent: false as const,
  }));
}
