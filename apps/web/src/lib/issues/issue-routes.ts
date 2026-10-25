import type { IStory } from "@/types";

export function issueKey(identifier: string, order: number) {
  return `${identifier}-${order + 1}`;
}

/**
 * Human work-item code, e.g. "G-42". Prefers the backend-provided `code`; falls
 * back to identifier + the immutable `story_number` (NOT sort_order).
 */
export function storyCode(
  identifier: string,
  story: Pick<IStory, "code" | "story_number">,
): string {
  if (story.code) return story.code;
  return story.story_number != null ? `${identifier}-${story.story_number}` : identifier;
}

/** Dedicated issue detail page for product stories (bmad === null). */
export function issueDetailHref(workspaceSlug: string, story: Pick<IStory, "id" | "project_id" | "bmad">) {
  return `/${workspaceSlug}/projects/${story.project_id}/issues/${story.id}`;
}

/** Opens the work item in the peek sheet (project-layout must host `<IssuePeekSheet/>`). */
export function peekHref(story: Pick<IStory, "id">) {
  return `?peek=${story.id}`;
}

/** Story-scoped AI assistant — peek (`?peek=&assistant=1`) or full page route. */
export function storyAssistantHref(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  opts?: { peek?: boolean; search?: string },
) {
  if (opts?.peek) {
    const params = new URLSearchParams(opts.search ?? "");
    params.set("peek", storyId);
    params.set("assistant", "1");
    params.delete("doc");
    return `?${params.toString()}`;
  }
  return `/${workspaceSlug}/projects/${projectId}/issues/${storyId}/assistant`;
}

/** Best-effort deep link for any story (BMAD → board, product → issue page). */
export function storyWorkHref(
  workspaceSlug: string,
  story: Pick<IStory, "id" | "project_id" | "cycle_id" | "bmad">,
) {
  if (story.bmad) {
    if (story.bmad.workflow) {
      return `/${workspaceSlug}/projects/${story.project_id}/board?openWorkflow=${encodeURIComponent(story.bmad.workflow)}`;
    }
    return `/${workspaceSlug}/projects/${story.project_id}/board?openStory=${story.id}`;
  }
  return issueDetailHref(workspaceSlug, story);
}
